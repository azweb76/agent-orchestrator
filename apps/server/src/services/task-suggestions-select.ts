import { v4 as uuidv4 } from 'uuid';
import {
  filterApplicableTaskFollowUps,
  toTaskSuggestions,
  type AgentDeliveryPhase,
  type TaskFollowUp,
  type TaskSuggestion,
  type TaskSuggestionChangeStatus,
  type TaskSuggestionDraft,
} from '@agent-orchestrator/shared';
import { extractJsonObject } from './extract-json-object.js';

const MAX_TOTAL_SUGGESTIONS = 6;

export interface TaskFollowUpCatalogItem {
  id: string;
  name: string;
  title: string;
  description: string;
  prompt: string;
  kind: TaskFollowUp['kind'];
  template: TaskFollowUp['template'];
}

export interface TaskSuggestionsAgentSnapshot {
  agentName: string;
  agentStatus: string;
  model: string;
  effort: string;
  permissionMode: string;
  sessionTitle: string;
  sessionTemplate: string;
  sessionPermissionMode: string;
  branch: string;
  baseBranch: string;
  prNumber: number | null;
  githubOwner: string;
  githubRepo: string;
  deliveryPhase: AgentDeliveryPhase;
  changeStatus: TaskSuggestionChangeStatus;
}

export interface TaskSuggestionsContext {
  agent: TaskSuggestionsAgentSnapshot;
  catalog: TaskFollowUpCatalogItem[];
  recentAssistantMessages: string[];
}

export function buildTaskSuggestionsPrompt(context: TaskSuggestionsContext): {
  system: string;
  user: string;
} {
  const system = [
    'You choose which follow-up chips to show after a coding-agent chat session finishes.',
    'Call the submit_task_suggestions tool with an ordered list of followUpIds from the catalog.',
    'If you cannot call a tool, respond with ONLY a JSON object {"followUpIds":["..."]} (no markdown fences).',
    'Pick 1 to 6 ids that best match the agent state and recent assistant replies.',
    'Prefer concrete, relevant next steps. Omit inapplicable status actions (commit/PR/CI/review) when the change status says they do not apply.',
    'Do not invent ids. Only use catalog ids.',
    'Order matters: most useful first.',
  ].join(' ');

  const agent = context.agent;
  const catalog = context.catalog
    .map(
      (item) =>
        `- id=${item.id} name=${item.name} title=${item.title} kind=${item.kind}` +
        `${item.template ? ` template=${item.template}` : ''}\n` +
        `  description: ${item.description || '(none)'}\n` +
        `  prompt: ${item.prompt}`,
    )
    .join('\n');

  const messages =
    context.recentAssistantMessages.length > 0
      ? context.recentAssistantMessages
          .map((text, index) => `### Assistant message ${index + 1}\n${text || '(empty)'}`)
          .join('\n\n')
      : '(none)';

  const user = [
    'Agent snapshot:',
    JSON.stringify(
      {
        agentName: agent.agentName,
        agentStatus: agent.agentStatus,
        model: agent.model,
        effort: agent.effort,
        permissionMode: agent.permissionMode,
        sessionTitle: agent.sessionTitle,
        sessionTemplate: agent.sessionTemplate,
        sessionPermissionMode: agent.sessionPermissionMode,
        branch: agent.branch,
        baseBranch: agent.baseBranch,
        prNumber: agent.prNumber,
        repo: `${agent.githubOwner}/${agent.githubRepo}`,
        deliveryPhase: agent.deliveryPhase,
        changeStatus: {
          hasPendingChanges: agent.changeStatus.hasPendingChanges,
          hasBranchDiff: agent.changeStatus.hasBranchDiff,
          hasOpenPr: agent.changeStatus.hasOpenPr,
          pr: agent.changeStatus.pr ?? null,
        },
      },
      null,
      2,
    ),
    '',
    'Follow-up catalog:',
    catalog || '(empty)',
    '',
    'Recent assistant messages (oldest to newest):',
    messages,
  ].join('\n');

  return { system, user };
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** Parse LLM JSON into ordered catalog ids. Empty list when nothing valid. */
export function parseTaskFollowUpSelection(
  raw: unknown,
  catalogIds: ReadonlySet<string>,
  max = MAX_TOTAL_SUGGESTIONS,
): string[] {
  const parsed = extractJsonObject(raw, 'Task suggestions response');
  const items = Array.isArray(parsed.followUpIds)
    ? parsed.followUpIds
    : Array.isArray(parsed.suggestions)
      ? parsed.suggestions
      : [];

  const selected: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    if (selected.length >= max) break;
    let id = '';
    if (typeof item === 'string') {
      id = item.trim();
    } else if (item && typeof item === 'object' && !Array.isArray(item)) {
      const row = item as Record<string, unknown>;
      id = asString(row.id) || asString(row.followUpId) || asString(row.candidateId);
    }
    if (!id || seen.has(id) || !catalogIds.has(id)) continue;
    seen.add(id);
    selected.push(id);
  }
  return selected;
}

/** @deprecated Prefer parseTaskFollowUpSelection; kept for legacy tool payloads. */
export function parseTaskSuggestionDrafts(raw: unknown): TaskSuggestionDraft[] {
  const parsed = extractJsonObject(raw, 'Task suggestions response');
  const items = Array.isArray(parsed.suggestions) ? parsed.suggestions : [];
  const drafts: TaskSuggestionDraft[] = [];
  for (const item of items) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;
    const title = asString(row.title) || asString(row.name);
    const prompt = asString(row.prompt);
    if (!title || !prompt) continue;
    drafts.push({
      title,
      description: asString(row.description) || undefined,
      prompt,
      kind: 'prompt',
    });
    if (drafts.length >= 4) break;
  }
  return drafts;
}

/** @deprecated Prefer id selection + catalog mapping. */
export function parseTaskSuggestionsResponse(raw: unknown): TaskSuggestion[] {
  return toTaskSuggestions(parseTaskSuggestionDrafts(raw), () => uuidv4());
}

export function followUpToSuggestion(followUp: TaskFollowUp): TaskSuggestion {
  return {
    id: followUp.id,
    title: followUp.title,
    description: followUp.description || undefined,
    prompt: followUp.prompt,
    kind: followUp.kind,
    template: followUp.template ?? undefined,
  };
}

export function mapFollowUpIdsToSuggestions(
  ids: string[],
  catalog: readonly TaskFollowUp[],
  changeStatus: TaskSuggestionChangeStatus,
  max = MAX_TOTAL_SUGGESTIONS,
): TaskSuggestion[] {
  const byId = new Map(catalog.map((item) => [item.id, item]));
  const mapped: TaskSuggestion[] = [];
  for (const id of ids) {
    const followUp = byId.get(id);
    if (!followUp) continue;
    if (!filterApplicableTaskFollowUps([followUp], changeStatus).length) continue;
    mapped.push(followUpToSuggestion(followUp));
    if (mapped.length >= max) break;
  }
  return mapped;
}
