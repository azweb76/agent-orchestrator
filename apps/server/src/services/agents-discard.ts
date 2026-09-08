import type { DiscardAgentFilesRequest, DiscardAgentFilesResponse } from '@agent-orchestrator/shared';
import { requireAgent } from './agent-core.js';
import { getAgentDetail } from './agents-lifecycle.js';
import { type AppContext, makeEvent, notify } from './app-context.js';

export async function discardAgentFiles(
  ctx: AppContext,
  agentId: string,
  body: DiscardAgentFilesRequest,
): Promise<DiscardAgentFilesResponse> {
  const agent = requireAgent(ctx, agentId);
  if (agent.archivedAt) throw new Error('Cannot undo files for an archived agent');

  const detail = await getAgentDetail(ctx, agentId);
  const restored = await ctx.git.restoreWorktreePaths(detail.worktree.path, body.paths);

  ctx.repos.events.create(makeEvent(agentId, 'files_discarded', { paths: restored }));
  notify(ctx, 'agent_changed', { agentId });
  return { restored };
}
