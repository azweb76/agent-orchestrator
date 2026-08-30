import path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import { buildIssueKickoffPrompt, parseIssueReference, renderAgentTaskPromptTemplate } from '@agent-orchestrator/shared';
import type {
  Agent,
  AgentTask,
  CreateWorktreeFromBranchRequest,
  CreateWorktreeFromGoalRequest,
  CreateWorktreeFromIdeaRequest,
  CreateWorktreeFromIssueRequest,
  CreateWorktreeFromPrRequest,
  Workspace,
  Worktree,
  WorktreeWithAgent,
} from '@agent-orchestrator/shared';
import { slugify } from './git.js';
import { mergeLivePullRequest } from './pr-overlay.js';
import { type AppContext, nowIso, notify } from './app-context.js';
import { clearSessionRunFields, createAgentForWorktree } from './agent-core.js';
import { markStreamingAssistantStopped } from './chat-run-lifecycle.js';
import { requireAgentTaskByName } from './agent-tasks.js';

// Overlays a live GitHub PR lookup (by branch) onto a worktree's prNumber/prTitle.
// Falls back to the worktree's existing (DB-stored) values when no GitHub token is
// configured, when the lookup fails, or when no PR matches the branch name.
export async function overlayLivePullRequest(
  ctx: AppContext,
  workspace: Workspace,
  worktree: Worktree,
): Promise<Worktree> {
  if (!process.env.GITHUB_TOKEN) {
    return worktree;
  }

  try {
    const pr = await ctx.github.getPullRequestForBranch(
      workspace.githubOwner,
      workspace.githubRepo,
      worktree.branch,
    );
    return mergeLivePullRequest(worktree, pr);
  } catch {
    return worktree;
  }
}

export async function listWorktrees(ctx: AppContext, workspaceId: string): Promise<WorktreeWithAgent[]> {
  const worktrees = ctx.repos.worktrees.listByWorkspace(workspaceId);
  const workspace = ctx.repos.workspaces.getById(workspaceId);

  const withLivePr = workspace
    ? await Promise.all(worktrees.map((worktree) => overlayLivePullRequest(ctx, workspace, worktree)))
    : worktrees;

  return withLivePr.map((worktree) => ({
    ...worktree,
    agent: ctx.repos.agents.getByWorktreeId(worktree.id),
  }));
}

export async function createWorktreeFromBranch(
  ctx: AppContext,
  workspaceId: string,
  body: CreateWorktreeFromBranchRequest,
) {
  const workspace = ctx.repos.workspaces.getById(workspaceId);
  if (!workspace) throw new Error('Workspace not found');

  const name = body.name ?? slugify(body.branch);
  const worktreePath = path.join(ctx.dataDir, 'worktrees', workspaceId, name);
  const id = uuidv4();

  const baseBranch = body.baseBranch ?? workspace.defaultBranch;
  await ctx.git.fetch(workspace.repoPath);

  if (body.createNew) {
    await ctx.git.addWorktree(workspace.repoPath, worktreePath, body.branch, {
      createBranch: true,
      startRef: `origin/${baseBranch}`,
    });
  } else {
    await ctx.git.addWorktree(workspace.repoPath, worktreePath, body.branch);
  }

  const worktree = ctx.repos.worktrees.create({
    id,
    workspaceId,
    name,
    path: worktreePath,
    branch: body.branch,
    prNumber: null,
    prTitle: null,
    baseBranch: body.createNew ? baseBranch : workspace.defaultBranch,
    createdAt: nowIso(),
  });

  const agent = await createAgentForWorktree(ctx, worktree.id, `${name} agent`);
  notify(ctx, 'workspaces_changed');
  return { worktree, agent };
}

export async function createWorktreeFromPr(
  ctx: AppContext,
  workspaceId: string,
  body: CreateWorktreeFromPrRequest,
) {
  const workspace = ctx.repos.workspaces.getById(workspaceId);
  if (!workspace) throw new Error('Workspace not found');

  const pr = await ctx.github.getPullRequest(workspace.githubOwner, workspace.githubRepo, body.prNumber);

  const existingByPr = ctx.repos.worktrees.getByWorkspaceAndPr(workspace.id, body.prNumber);
  const existingByBranch = ctx.repos.worktrees.getByWorkspaceAndBranch(workspace.id, pr.headRef);
  const existing = existingByPr ?? existingByBranch;
  if (existing) {
    let agent = ctx.repos.agents.getByWorktreeId(existing.id);
    if (!agent) {
      agent = await createAgentForWorktree(ctx, existing.id, `PR #${body.prNumber} agent`);
    }
    return { worktree: existing, agent };
  }
  const localBranch = pr.headRef;
  const name = body.name ?? slugify(pr.headRef);
  const worktreePath = path.join(ctx.dataDir, 'worktrees', workspaceId, name);
  const id = uuidv4();

  await ctx.git.fetchPullRequest(workspace.repoPath, body.prNumber, localBranch);

  // If a previous from-PR left the branch checked out (e.g. DB row removed but
  // git worktree remained), adopt that path instead of failing on worktree add.
  const existingGitPath = await ctx.git.getWorktreePathForBranch(workspace.repoPath, localBranch);
  const resolvedPath = existingGitPath ?? worktreePath;
  if (!existingGitPath) {
    await ctx.git.addWorktree(workspace.repoPath, worktreePath, localBranch);
  }

  const worktree = ctx.repos.worktrees.create({
    id,
    workspaceId,
    name: existingGitPath ? path.basename(existingGitPath) : name,
    path: resolvedPath,
    branch: localBranch,
    prNumber: pr.number,
    prTitle: pr.title,
    baseBranch: pr.baseRef,
    createdAt: nowIso(),
  });

  const agent = await createAgentForWorktree(ctx, worktree.id, `PR #${pr.number} agent`);
  notify(ctx, 'workspaces_changed');
  return { worktree, agent };
}

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

async function suggestBranchNameForWorkspace(
  ctx: AppContext,
  workspaceId: string,
  idea: string,
): Promise<string> {
  const workspace = ctx.repos.workspaces.getById(workspaceId);
  if (!workspace) throw new Error('Workspace not found');
  return ctx.anthropic.suggestBranchName(idea);
}

/**
 * Resolve an AgentTask for From goal: explicit slug, or Auto via purpose matching.
 */
export async function resolveAgentTaskForGoal(
  ctx: AppContext,
  goal: string,
  taskRef: string,
): Promise<AgentTask> {
  const ref = taskRef.trim().toLowerCase();
  if (!ref) throw new Error('Task is required');

  if (ref !== 'auto') {
    return requireAgentTaskByName(ctx, ref);
  }

  const candidates = ctx.repos.agentTasks
    .list()
    .filter((item) => item.purpose.trim().length > 0)
    .map((item) => ({
      name: item.name,
      title: item.title,
      purpose: item.purpose.trim(),
    }));

  if (candidates.length === 0) {
    throw new Error('No tasks with a purpose are configured for Auto');
  }

  let selected: string | null;
  try {
    selected = await ctx.anthropic.selectAgentTaskForGoal(goal, candidates);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Could not match goal to a task: ${message}`);
  }

  if (!selected) {
    throw new Error('Could not match goal to a task');
  }

  return requireAgentTaskByName(ctx, selected);
}

/**
 * Suggest a branch name from the goal, create a new worktree + agent using the
 * resolved AgentTask, and return the kickoff prompt.
 */
export async function createWorktreeFromGoal(
  ctx: AppContext,
  workspaceId: string,
  body: CreateWorktreeFromGoalRequest,
) {
  const goal = body.goal.trim();
  if (!goal) throw new Error('Goal is required');
  if (!body.task?.trim()) throw new Error('Task is required');

  const task = await resolveAgentTaskForGoal(ctx, goal, body.task);
  const branchName = await suggestBranchNameForWorkspace(ctx, workspaceId, goal);
  const workspace = ctx.repos.workspaces.getById(workspaceId);
  if (!workspace) throw new Error('Workspace not found');

  const name = body.name ?? slugify(branchName);
  const worktreePath = path.join(ctx.dataDir, 'worktrees', workspaceId, name);
  const id = uuidv4();
  const baseBranch = body.baseBranch ?? workspace.defaultBranch;
  await ctx.git.fetch(workspace.repoPath);
  await ctx.git.addWorktree(workspace.repoPath, worktreePath, branchName, {
    createBranch: true,
    startRef: `origin/${baseBranch}`,
  });

  const worktree = ctx.repos.worktrees.create({
    id,
    workspaceId,
    name,
    path: worktreePath,
    branch: branchName,
    prNumber: null,
    prTitle: null,
    baseBranch,
    createdAt: nowIso(),
  });

  const agent = await createAgentForWorktree(ctx, worktree.id, `${name} agent`, {
    task,
    model: body.model,
    effort: body.effort,
  });
  notify(ctx, 'workspaces_changed');

  const kickoffPrompt = renderAgentTaskPromptTemplate(task.promptTemplate, { goal });
  return { worktree, agent, branchName, goal, kickoffPrompt, task };
}

/** @deprecated Prefer createWorktreeFromGoal. */
export async function createWorktreeFromIdea(
  ctx: AppContext,
  workspaceId: string,
  body: CreateWorktreeFromIdeaRequest,
) {
  const result = await createWorktreeFromGoal(ctx, workspaceId, {
    goal: body.idea,
    name: body.name,
    baseBranch: body.baseBranch,
    task: body.task,
    model: body.model,
    effort: body.effort,
  });
  return { ...result, idea: result.goal };
}

async function resolveIssueNumberForWorkspace(
  ctx: AppContext,
  workspaceId: string,
  body: CreateWorktreeFromIssueRequest,
): Promise<number> {
  const reference = body.reference?.trim();
  if (reference) {
    const parsed = parseIssueReference(reference);
    if (!parsed) throw new Error('Invalid issue reference. Use owner/repo#n or a GitHub issue URL.');
    const workspace = ctx.repos.workspaces.getById(workspaceId);
    if (!workspace) throw new Error('Workspace not found');
    if (
      parsed.owner.toLowerCase() !== workspace.githubOwner.toLowerCase() ||
      parsed.repo.toLowerCase() !== workspace.githubRepo.toLowerCase()
    ) {
      throw new Error(
        `Issue ${parsed.owner}/${parsed.repo}#${parsed.number} does not match workspace ${workspace.githubOwner}/${workspace.githubRepo}`,
      );
    }
    return parsed.number;
  }

  if (!body.issueNumber || body.issueNumber <= 0) {
    throw new Error('Issue number or reference is required');
  }
  return body.issueNumber;
}

/**
 * Fetch a GitHub issue, create a new worktree + plan-mode agent, and return the kickoff prompt.
 */
export async function createWorktreeFromIssue(
  ctx: AppContext,
  workspaceId: string,
  body: CreateWorktreeFromIssueRequest,
) {
  const workspace = ctx.repos.workspaces.getById(workspaceId);
  if (!workspace) throw new Error('Workspace not found');

  const issueNumber = await resolveIssueNumberForWorkspace(ctx, workspaceId, body);
  const issue = await ctx.github.getIssueDetail(workspace.githubOwner, workspace.githubRepo, issueNumber);
  const prompt = buildIssueKickoffPrompt(issue, issue.comments);

  const branchName = await ctx.anthropic.suggestBranchName(`${issue.title}\n\n${issue.body}`.trim());
  const { worktree, agent } = await createWorktreeFromBranch(ctx, workspaceId, {
    branch: branchName,
    createNew: true,
    baseBranch: body.baseBranch,
    name: body.name,
  });

  const configured: Agent = {
    ...agent,
    model: body.model?.trim() || agent.model,
    effort: body.effort ?? agent.effort,
    permissionMode: body.permissionMode ?? 'plan',
    updatedAt: nowIso(),
  };
  if (
    configured.model !== agent.model ||
    configured.effort !== agent.effort ||
    configured.permissionMode !== agent.permissionMode
  ) {
    ctx.repos.agents.update(configured);
  }

  return { worktree, agent: configured, branchName, issueNumber, prompt };
}
