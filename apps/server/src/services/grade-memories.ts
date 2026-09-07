import { v4 as uuidv4 } from 'uuid';
import type { ChatSession, SessionGradeFinding } from '@agent-orchestrator/shared';
import type { AppContext } from './app-context.js';
import { nowIso } from './app-context.js';
import { requireAgent } from './agent-core.js';

const SITUATIONAL_CATEGORIES = new Set([
  'excessive_turns',
  'wasted_tokens',
  'bloated_context',
]);

function sanitizeKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/**
 * Persist short agent-scoped lessons from efficiency findings.
 * Standing process belongs in skills / CLAUDE.md; these capture situational notes.
 */
export function recordGradeMemoriesFromFindings(
  ctx: AppContext,
  agentId: string,
  session: ChatSession,
  findings: SessionGradeFinding[],
): number {
  const agent = requireAgent(ctx, agentId);
  const worktree = ctx.repos.worktrees.getById(agent.worktreeId);
  if (!worktree) return 0;

  const situational = findings.filter(
    (item) =>
      item.severity !== 'ok' &&
      SITUATIONAL_CATEGORIES.has(item.category) &&
      (item.suggestion?.trim() || item.detail.trim()),
  );
  if (situational.length === 0) return 0;

  const timestamp = nowIso();
  let written = 0;
  for (const finding of situational) {
    const key = sanitizeKey(`grade.${finding.category}.${session.template}`);
    if (!key) continue;
    const content = (finding.suggestion?.trim() || finding.detail.trim()).slice(0, 500);
    const existing = ctx.repos.memories.findActiveByScopeKey({
      scope: 'agent',
      workspaceId: worktree.workspaceId,
      agentId,
      key,
    });
    if (existing) {
      ctx.repos.memories.update({
        ...existing,
        kind: 'lesson',
        content,
        source: 'grade',
        sourceSessionId: session.id,
        updatedAt: timestamp,
      });
    } else {
      ctx.repos.memories.create({
        id: uuidv4(),
        scope: 'agent',
        workspaceId: worktree.workspaceId,
        agentId,
        kind: 'lesson',
        key,
        content,
        source: 'grade',
        sourceSessionId: session.id,
        status: 'active',
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    }
    written += 1;
  }
  return written;
}
