import { type AppContext, notify } from './app-context.js';
import { clearSessionRunFields } from './agent-core.js';
import { markStreamingAssistantStopped } from './chat-run-lifecycle.js';

export async function deleteWorktree(ctx: AppContext, worktreeId: string) {
  const worktree = ctx.repos.worktrees.getById(worktreeId);
  if (!worktree) throw new Error('Worktree not found');

  const workspace = ctx.repos.workspaces.getById(worktree.workspaceId);
  if (!workspace) throw new Error('Workspace not found');

  for (const agent of ctx.repos.agents.listByWorktreeId(worktreeId)) {
    for (const session of ctx.repos.sessions.listByAgent(agent.id)) {
      if (session.status === 'running' || session.pid != null) {
        ctx.claude.stop(session.id, session.pid, session.runLogPath);
        ctx.repos.sessions.update(
          clearSessionRunFields(session, {
            status: session.status === 'running' ? 'idle' : session.status,
          }),
        );
        markStreamingAssistantStopped(ctx, agent.id, session.id);
      }
    }
  }

  await ctx.git.removeWorktree(workspace.repoPath, worktree.path);
  ctx.repos.worktrees.delete(worktreeId);
  notify(ctx, 'workspaces_changed');
}
