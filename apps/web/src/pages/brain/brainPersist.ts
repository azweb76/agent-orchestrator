import { brainDraftIdentity, type AgentTask, type BrainChangeFile, type BrainDraft, type TaskFollowUp } from '@agent-orchestrator/shared';
import { api } from '../../api/client';

export function taskToDraft(task: AgentTask): BrainDraft {
  return {
    kind: 'task',
    id: task.id,
    name: task.name,
    title: task.title,
    description: task.description,
    purpose: task.purpose,
    promptTemplate: task.promptTemplate ?? '',
    systemPrompt: task.systemPrompt ?? '',
    allowedTools: task.allowedTools ?? '',
    model: task.model,
    effort: task.effort,
    permissionMode: task.permissionMode,
    listed: task.listed,
  };
}

export function followUpToDraft(followUp: TaskFollowUp): BrainDraft {
  return {
    kind: 'follow-up',
    id: followUp.id,
    name: followUp.name,
    title: followUp.title,
    description: followUp.description,
    prompt: followUp.prompt,
    kindValue: followUp.kind,
    template: followUp.template ?? '',
    enabled: followUp.enabled,
  };
}

export async function saveCatalogDraft(
  draft: BrainDraft,
  editingTask?: AgentTask,
  editingFollowUp?: TaskFollowUp,
): Promise<unknown> {
  if (draft.kind === 'task') {
    const body = {
      name: draft.name.trim(),
      title: draft.title.trim(),
      description: draft.description.trim(),
      purpose: draft.purpose.trim(),
      promptTemplate: draft.promptTemplate.trim() || null,
      systemPrompt: draft.systemPrompt.trim() || null,
      allowedTools: draft.allowedTools.trim() || null,
      model: draft.model,
      effort: draft.effort,
      permissionMode: draft.permissionMode,
      listed: draft.listed,
    };
    if (draft.id) {
      const { name: _name, ...rest } = body;
      return api.updateAgentTask(draft.id, editingTask?.builtIn ? rest : body);
    }
    return api.createAgentTask(body);
  }
  if (draft.kind !== 'follow-up') throw new Error('Unsupported catalog draft');
  const body = {
    name: draft.name.trim(),
    title: draft.title.trim(),
    description: draft.description.trim(),
    prompt: draft.prompt.trim(),
    kind: draft.kindValue,
    template: draft.kindValue === 'start-template' ? draft.template || null : null,
    enabled: draft.enabled,
  };
  if (draft.id) {
    const { name: _name, ...rest } = body;
    return api.updateTaskFollowUp(draft.id, editingFollowUp?.builtIn ? rest : body);
  }
  return api.createTaskFollowUp(body);
}

export async function acceptChangeFiles(
  files: BrainChangeFile[],
  catalogs: { tasks?: AgentTask[]; followUps?: TaskFollowUp[] },
): Promise<{ failed: string[]; succeededIds: string[] }> {
  const failed: string[] = [];
  const succeededIds: string[] = [];
  for (const file of files) {
    try {
      if (file.kind === 'skill' || file.kind === 'agent') {
        await persistMarkdownFile(file);
      } else if (file.draft.kind === 'task') {
        const taskId = file.draft.id;
        const editing = catalogs.tasks?.find((item) => item.id === taskId);
        await saveCatalogDraft(file.draft, editing, undefined);
      } else if (file.draft.kind === 'follow-up') {
        const followUpId = file.draft.id;
        const editing = catalogs.followUps?.find((item) => item.id === followUpId);
        await saveCatalogDraft(file.draft, undefined, editing);
      } else {
        continue;
      }
      succeededIds.push(file.id);
    } catch (error) {
      const identity = brainDraftIdentity(file.draft) ?? file.draft.name;
      failed.push(`${file.kind}:${identity}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { failed, succeededIds };
}

async function persistMarkdownFile(file: BrainChangeFile): Promise<void> {
  if (file.draft.kind !== 'skill' && file.draft.kind !== 'agent') return;
  const body = {
    name: file.draft.name.trim(),
    description: file.draft.description.trim(),
    content: file.draft.content.trim(),
  };
  if (file.kind === 'skill') {
    if (file.draft.slug) await api.updatePersonalSkill(file.draft.slug, body);
    else await api.createPersonalSkill(body);
    return;
  }
  if (file.draft.slug) await api.updatePersonalAgent(file.draft.slug, body);
  else await api.createPersonalAgent(body);
}
