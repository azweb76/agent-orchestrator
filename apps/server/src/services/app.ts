import path from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import type { Response } from 'express';
import type {
  Agent,
  AgentDetail,
  AgentEvent,
  CreateAgentFromPrRequest,
  CreatePrRequest,
  CreateWorktreeFromBranchRequest,
  CreateWorktreeFromPrRequest,
  CreateWorkspaceRequest,
  InboxPullRequest,
  Message,
  PullRequestInbox,
  UpdateAgentRequest,
  SidebarWorkspace,
  Workspace,
  Worktree,
  WorktreeWithAgent,
  WorkspaceWithCounts,
} from '@agent-orchestrator/shared';
import type { AppRepositories } from '../db/index.js';
import { ClaudeService, GitService, parseGitHubUrl, slugify } from '../services/git.js';
import { GitHubService, type SearchedPullRequest } from '../services/github.js';
import { AnthropicService } from '../services/anthropic.js';

export interface AppContext {
  repos: AppRepositories;
  git: GitService;
  github: GitHubService;
  claude: ClaudeService;
  anthropic: AnthropicService;
  dataDir: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

async function createAgentForWorktree(
  ctx: AppContext,
  worktreeId: string,
  name: string,
): Promise<Agent> {
  const existing = ctx.repos.agents.getByWorktreeId(worktreeId);
  if (existing) {
    throw new Error('This worktree already has an active agent');
  }

  const timestamp = nowIso();
  const agent: Agent = {
    id: uuidv4(),
    worktreeId,
    name,
    status: 'idle',
    model: 'sonnet',
    environment: null,
    claudeSessionId: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    archivedAt: null,
  };

  ctx.repos.agents.create(agent);
  return agent;
}

export async function listWorkspaces(ctx: AppContext): Promise<WorkspaceWithCounts[]> {
  const workspaces = ctx.repos.workspaces.list();
  return workspaces.map((workspace) => {
    const worktrees = ctx.repos.worktrees.listByWorkspace(workspace.id);
    const agents = ctx.repos.agents.listByWorkspace(workspace.id);
    return {
      ...workspace,
      worktreeCount: worktrees.length,
      agentCount: agents.length,
    };
  });
}

/** Workspace → agents tree for the persistent app sidebar. */
export async function listSidebarTree(ctx: AppContext): Promise<SidebarWorkspace[]> {
  const workspaces = ctx.repos.workspaces.list();
  return workspaces.map((workspace) => {
    const worktrees = ctx.repos.worktrees.listByWorkspace(workspace.id);
    const worktreeById = new Map(worktrees.map((worktree) => [worktree.id, worktree]));
    const agents = ctx.repos.agents.listByWorkspace(workspace.id).map((agent) => {
      const worktree = worktreeById.get(agent.worktreeId);
      return {
        ...agent,
        worktree: {
          id: worktree?.id ?? agent.worktreeId,
          name: worktree?.name ?? 'Unknown',
          branch: worktree?.branch ?? '',
          prNumber: worktree?.prNumber ?? null,
        },
      };
    });
    return { ...workspace, agents };
  });
}

export async function createWorkspace(ctx: AppContext, body: CreateWorkspaceRequest) {
  const { owner, repo } = parseGitHubUrl(body.repoUrl);
  const id = uuidv4();
  const repoPath = path.join(ctx.dataDir, 'repos', id);
  await ctx.git.clone(body.repoUrl, repoPath);

  let defaultBranch = 'main';
  try {
    defaultBranch = await ctx.git.getDefaultBranch(repoPath);
  } catch {
    // fallback
  }

  const workspace = ctx.repos.workspaces.create({
    id,
    name: body.name ?? repo,
    repoUrl: body.repoUrl,
    repoPath,
    defaultBranch,
    githubOwner: owner,
    githubRepo: repo,
    createdAt: nowIso(),
  });

  return workspace;
}

export async function getWorkspace(ctx: AppContext, workspaceId: string) {
  const workspace = ctx.repos.workspaces.getById(workspaceId);
  if (!workspace) throw new Error('Workspace not found');
  return workspace;
}

export async function deleteWorkspace(ctx: AppContext, workspaceId: string) {
  const workspace = ctx.repos.workspaces.getById(workspaceId);
  if (!workspace) throw new Error('Workspace not found');
  ctx.repos.workspaces.delete(workspaceId);
}

// Overlays a live GitHub PR lookup (by branch) onto a worktree's prNumber/prTitle.
// Falls back to the worktree's existing (DB-stored) values when no GitHub token is
// configured or when the lookup fails, so a transient GitHub API issue never breaks
// the worktree list/detail response.
async function overlayLivePullRequest(
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
    return { ...worktree, prNumber: pr?.number ?? null, prTitle: pr?.title ?? null };
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
  const localBranch = `pr-${body.prNumber}`;
  const name = body.name ?? slugify(`pr-${body.prNumber}-${pr.headRef}`);
  const worktreePath = path.join(ctx.dataDir, 'worktrees', workspaceId, name);
  const id = uuidv4();

  await ctx.git.fetchPullRequest(workspace.repoPath, body.prNumber, localBranch);
  await ctx.git.addWorktree(workspace.repoPath, worktreePath, localBranch);

  const worktree = ctx.repos.worktrees.create({
    id,
    workspaceId,
    name,
    path: worktreePath,
    branch: localBranch,
    prNumber: pr.number,
    prTitle: pr.title,
    baseBranch: pr.baseRef,
    createdAt: nowIso(),
  });

  const agent = await createAgentForWorktree(ctx, worktree.id, `PR #${pr.number} agent`);
  return { worktree, agent };
}

export async function deleteWorktree(ctx: AppContext, worktreeId: string) {
  const worktree = ctx.repos.worktrees.getById(worktreeId);
  if (!worktree) throw new Error('Worktree not found');

  const workspace = ctx.repos.workspaces.getById(worktree.workspaceId);
  if (!workspace) throw new Error('Workspace not found');

  const agent = ctx.repos.agents.getByWorktreeId(worktreeId);
  if (agent) {
    ctx.claude.stop(agent.id);
  }

  await ctx.git.removeWorktree(workspace.repoPath, worktree.path);
  ctx.repos.worktrees.delete(worktreeId);
}

export async function getAgentDetail(ctx: AppContext, agentId: string): Promise<AgentDetail> {
  const agent = ctx.repos.agents.getById(agentId);
  if (!agent) throw new Error('Agent not found');

  const worktree = ctx.repos.worktrees.getById(agent.worktreeId);
  if (!worktree) throw new Error('Worktree not found');

  const workspace = ctx.repos.workspaces.getById(worktree.workspaceId);
  if (!workspace) throw new Error('Workspace not found');

  const liveWorktree = await overlayLivePullRequest(ctx, workspace, worktree);
  return { ...agent, worktree: liveWorktree, workspace };
}

export async function updateAgent(ctx: AppContext, agentId: string, body: UpdateAgentRequest) {
  const agent = ctx.repos.agents.getById(agentId);
  if (!agent) throw new Error('Agent not found');
  if (agent.archivedAt) throw new Error('Cannot update archived agent');

  const updated: Agent = {
    ...agent,
    name: body.name ?? agent.name,
    model: body.model ?? agent.model,
    environment: body.environment !== undefined ? body.environment : agent.environment,
    updatedAt: nowIso(),
  };

  ctx.repos.agents.update(updated);
  return updated;
}

export async function startAgent(ctx: AppContext, agentId: string) {
  const agent = ctx.repos.agents.getById(agentId);
  if (!agent) throw new Error('Agent not found');
  if (agent.archivedAt) throw new Error('Cannot start archived agent');

  const installed = await ctx.claude.checkInstalled();
  if (!installed) {
    throw new Error('Claude Code CLI is not installed or not on PATH');
  }

  const updated: Agent = { ...agent, status: 'idle', updatedAt: nowIso() };
  ctx.repos.agents.update(updated);
  ctx.repos.events.create(makeEvent(agentId, 'agent_started', { message: 'Agent ready for chat' }));
  return updated;
}

export async function stopAgent(ctx: AppContext, agentId: string) {
  const agent = ctx.repos.agents.getById(agentId);
  if (!agent) throw new Error('Agent not found');

  ctx.claude.stop(agentId);
  const updated: Agent = { ...agent, status: 'stopped', updatedAt: nowIso() };
  ctx.repos.agents.update(updated);
  ctx.repos.events.create(makeEvent(agentId, 'agent_stopped', {}));
  return updated;
}

export async function archiveAgent(ctx: AppContext, agentId: string) {
  const agent = ctx.repos.agents.getById(agentId);
  if (!agent) throw new Error('Agent not found');

  ctx.claude.stop(agentId);
  const updated: Agent = {
    ...agent,
    status: 'archived',
    archivedAt: nowIso(),
    updatedAt: nowIso(),
  };
  ctx.repos.agents.update(updated);
  ctx.repos.events.create(makeEvent(agentId, 'agent_archived', {}));
  return updated;
}

export function getAgentMessages(ctx: AppContext, agentId: string): Message[] {
  return ctx.repos.messages.listByAgent(agentId);
}

export function getAgentEvents(ctx: AppContext, agentId: string): AgentEvent[] {
  return ctx.repos.events.listByAgent(agentId);
}

export async function getAgentDiff(ctx: AppContext, agentId: string) {
  const detail = await getAgentDetail(ctx, agentId);
  const base = detail.worktree.baseBranch ?? detail.workspace.defaultBranch;
  try {
    return await ctx.git.getDiff(detail.worktree.path, `origin/${base}`);
  } catch {
    return await ctx.git.getDiff(detail.worktree.path);
  }
}

export async function createAgentPullRequest(
  ctx: AppContext,
  agentId: string,
  body: CreatePrRequest,
) {
  const detail = await getAgentDetail(ctx, agentId);
  const branch = await ctx.git.getCurrentBranch(detail.worktree.path);
  const base = body.base ?? detail.worktree.baseBranch ?? detail.workspace.defaultBranch;

  const hasChanges = await ctx.git.hasChanges(detail.worktree.path);
  if (hasChanges) {
    await ctx.git.commitAll(detail.worktree.path, body.title);
  }

  await ctx.git.pushBranch(detail.worktree.path, branch);

  const pr = await ctx.github.createPullRequest(
    detail.workspace.githubOwner,
    detail.workspace.githubRepo,
    {
      title: body.title,
      body: body.body,
      head: branch,
      base,
    },
  );

  ctx.repos.events.create(
    makeEvent(agentId, 'pr_created', { number: pr.number, htmlUrl: pr.htmlUrl }),
  );

  return pr;
}

export async function streamAgentChat(
  ctx: AppContext,
  agentId: string,
  message: string,
  res: Response,
) {
  const detail = await getAgentDetail(ctx, agentId);
  if (detail.archivedAt) {
    throw new Error('Cannot chat with archived agent');
  }

  const userMessage: Message = {
    id: uuidv4(),
    agentId,
    role: 'user',
    content: message,
    createdAt: nowIso(),
  };
  ctx.repos.messages.create(userMessage);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const send = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  send('user_message', userMessage);

  const runningAgent: Agent = { ...detail, status: 'running', updatedAt: nowIso() };
  ctx.repos.agents.update(runningAgent);

  const abortController = new AbortController();
  res.on('close', () => abortController.abort());

  let assistantText = '';

  try {
    const result = await ctx.claude.runStreaming(agentId, {
      cwd: detail.worktree.path,
      prompt: message,
      model: detail.model,
      environment: detail.environment,
      sessionId: detail.claudeSessionId,
      signal: abortController.signal,
      onEvent: (event) => {
        if (
          event.type === 'stream_event' &&
          event.event?.delta?.type === 'text_delta' &&
          event.event.delta.text
        ) {
          assistantText += event.event.delta.text;
          send('token', { text: event.event.delta.text });
        } else if (event.type !== 'stderr') {
          ctx.repos.events.create(makeEvent(agentId, event.type, event as Record<string, unknown>));
          send('event', event);
        }
      },
    });

    if (result.sessionId) {
      const withSession: Agent = {
        ...runningAgent,
        claudeSessionId: result.sessionId,
        status: 'idle',
        updatedAt: nowIso(),
      };
      ctx.repos.agents.update(withSession);
    } else {
      ctx.repos.agents.update({ ...runningAgent, status: 'idle', updatedAt: nowIso() });
    }

    const assistantMessage: Message = {
      id: uuidv4(),
      agentId,
      role: 'assistant',
      content: result.result || assistantText,
      createdAt: nowIso(),
    };
    ctx.repos.messages.create(assistantMessage);
    send('done', { message: assistantMessage, sessionId: result.sessionId });
  } catch (error) {
    ctx.repos.agents.update({ ...runningAgent, status: 'idle', updatedAt: nowIso() });
    send('error', { message: error instanceof Error ? error.message : 'Unknown error' });
  } finally {
    res.end();
  }
}

function makeEvent(agentId: string, type: string, data: Record<string, unknown>): AgentEvent {
  return {
    id: uuidv4(),
    agentId,
    type,
    data,
    createdAt: nowIso(),
  };
}

export async function listGitHubBranches(ctx: AppContext, workspaceId: string) {
  const workspace = ctx.repos.workspaces.getById(workspaceId);
  if (!workspace) throw new Error('Workspace not found');
  return ctx.github.listBranches(workspace.githubOwner, workspace.githubRepo);
}

export async function listGitHubPullRequests(ctx: AppContext, workspaceId: string) {
  const workspace = ctx.repos.workspaces.getById(workspaceId);
  if (!workspace) throw new Error('Workspace not found');
  return ctx.github.listPullRequests(workspace.githubOwner, workspace.githubRepo);
}

export async function searchGitHubRepositories(ctx: AppContext, query: string) {
  return ctx.github.searchRepositories(query);
}

function enrichInboxPullRequest(
  ctx: AppContext,
  pr: SearchedPullRequest,
  category: InboxPullRequest['category'],
): InboxPullRequest {
  const workspace = ctx.repos.workspaces.getByOwnerRepo(pr.owner, pr.repo);
  let agentId: string | null = null;

  if (workspace) {
    const worktree = ctx.repos.worktrees.getByWorkspaceAndPr(workspace.id, pr.number);
    if (worktree) {
      agentId = ctx.repos.agents.getByWorktreeId(worktree.id)?.id ?? null;
    }
  }

  return {
    number: pr.number,
    title: pr.title,
    state: pr.state,
    htmlUrl: pr.htmlUrl,
    draft: pr.draft,
    owner: pr.owner,
    repo: pr.repo,
    authorLogin: pr.authorLogin,
    updatedAt: pr.updatedAt,
    category,
    workspaceId: workspace?.id ?? null,
    agentId,
  };
}

export async function getPullRequestInbox(ctx: AppContext): Promise<PullRequestInbox> {
  const [authored, reviewRequested] = await Promise.all([
    ctx.github.listAuthoredOpenPullRequests(),
    ctx.github.listReviewRequestedPullRequests(),
  ]);

  return {
    authored: authored.map((pr) => enrichInboxPullRequest(ctx, pr, 'authored')),
    reviewRequested: reviewRequested.map((pr) => enrichInboxPullRequest(ctx, pr, 'review_requested')),
  };
}

export async function createAgentFromPullRequest(ctx: AppContext, body: CreateAgentFromPrRequest) {
  let workspace = ctx.repos.workspaces.getByOwnerRepo(body.owner, body.repo);

  if (!workspace) {
    workspace = await createWorkspace(ctx, {
      repoUrl: `https://github.com/${body.owner}/${body.repo}`,
      name: body.repo,
    });
  }

  const existingWorktree = ctx.repos.worktrees.getByWorkspaceAndPr(workspace.id, body.prNumber);
  if (existingWorktree) {
    const existingAgent = ctx.repos.agents.getByWorktreeId(existingWorktree.id);
    if (existingAgent) {
      return {
        workspace,
        worktree: existingWorktree,
        agent: existingAgent,
        created: false as const,
      };
    }
  }

  const { worktree, agent } = await createWorktreeFromPr(ctx, workspace.id, {
    prNumber: body.prNumber,
    name: body.name,
  });

  return {
    workspace,
    worktree,
    agent,
    created: true as const,
  };
}

export async function suggestBranchNameForWorkspace(
  ctx: AppContext,
  workspaceId: string,
  idea: string,
): Promise<string> {
  const workspace = ctx.repos.workspaces.getById(workspaceId);
  if (!workspace) throw new Error('Workspace not found');
  return ctx.anthropic.suggestBranchName(idea);
}

export async function getSystemStatus(ctx: AppContext) {
  const claudeInstalled = await ctx.claude.checkInstalled();
  return {
    claudeInstalled,
    claudeBin: process.env.CLAUDE_BIN ?? 'claude',
    githubTokenConfigured: Boolean(process.env.GITHUB_TOKEN),
  };
}
