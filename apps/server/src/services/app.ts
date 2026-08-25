import path from 'node:path';
import fs from 'node:fs/promises';
import { v4 as uuidv4 } from 'uuid';
import type { Response } from 'express';
import type {
  Agent,
  AgentDetail,
  AgentEvent,
  ChatImageAttachment,
  ChatRequest,
  CreateAgentFromPrRequest,
  CreatePrRequest,
  CreateWorktreeFromBranchRequest,
  CreateWorktreeFromPrRequest,
  CreateWorkspaceRequest,
  InboxPullRequest,
  Message,
  MessageAttachment,
  MessageMetadata,
  PullRequestInbox,
  UpdateAgentRequest,
  SidebarWorkspace,
  Workspace,
  Worktree,
  WorktreeWithAgent,
  WorkspaceWithCounts,
} from '@agent-orchestrator/shared';
import type { AppRepositories } from '../db/index.js';
import { ClaudeService, GitService, isPidAlive, parseGitHubUrl, slugify } from '../services/git.js';
import { GitHubService, type SearchedPullRequest } from '../services/github.js';
import { AnthropicService } from '../services/anthropic.js';
import { discoverSlashCommands } from '../services/slash-commands.js';
import { mergeLivePullRequest } from '../services/pr-overlay.js';

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
    permissionMode: 'bypassPermissions',
    claudeSessionId: null,
    pid: null,
    runLogPath: null,
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
// configured, when the lookup fails, or when no PR matches the branch name.
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
    ctx.claude.stop(agent.id, agent.pid);
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
    permissionMode: body.permissionMode ?? agent.permissionMode,
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

  ctx.claude.stop(agentId, agent.pid);
  const updated: Agent = {
    ...agent,
    status: 'stopped',
    pid: null,
    runLogPath: null,
    updatedAt: nowIso(),
  };
  ctx.repos.agents.update(updated);
  ctx.repos.events.create(makeEvent(agentId, 'agent_stopped', {}));
  return updated;
}

export async function archiveAgent(ctx: AppContext, agentId: string) {
  const agent = ctx.repos.agents.getById(agentId);
  if (!agent) throw new Error('Agent not found');

  ctx.claude.stop(agentId, agent.pid);
  const updated: Agent = {
    ...agent,
    status: 'archived',
    pid: null,
    runLogPath: null,
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

export async function clearAgentChat(ctx: AppContext, agentId: string): Promise<{ cleared: number }> {
  const agent = ctx.repos.agents.getById(agentId);
  if (!agent) throw new Error('Agent not found');
  if (agent.archivedAt) throw new Error('Cannot clear chat for archived agent');
  if (agent.status === 'running') {
    throw new Error('Cannot clear chat while the agent is running. Stop it first.');
  }

  const cleared = ctx.repos.messages.deleteByAgent(agentId);
  ctx.repos.agents.update({
    ...agent,
    claudeSessionId: null,
    updatedAt: nowIso(),
  });
  ctx.repos.events.create(makeEvent(agentId, 'chat_cleared', { cleared }));
  return { cleared };
}

export function getAgentAttachment(
  ctx: AppContext,
  agentId: string,
  attachmentId: string,
): MessageAttachment {
  const agent = ctx.repos.agents.getById(agentId);
  if (!agent) throw new Error('Agent not found');
  const attachment = ctx.repos.messages.findAttachment(agentId, attachmentId);
  if (!attachment) throw new Error('Attachment not found');
  return attachment;
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

export async function listAgentSlashCommands(ctx: AppContext, agentId: string) {
  const detail = await getAgentDetail(ctx, agentId);
  return discoverSlashCommands(detail.worktree.path);
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

  ctx.repos.worktrees.update({
    ...detail.worktree,
    prNumber: pr.number,
    prTitle: body.title,
  });

  ctx.repos.events.create(
    makeEvent(agentId, 'pr_created', { number: pr.number, htmlUrl: pr.htmlUrl }),
  );

  return pr;
}

function clearAgentRunFields(agent: Agent, overrides: Partial<Agent> = {}): Agent {
  return {
    ...agent,
    ...overrides,
    pid: null,
    runLogPath: null,
    updatedAt: nowIso(),
  };
}

function extractCostUsd(events: Array<{ total_cost_usd?: number; type?: string }>): number | undefined {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const cost = events[i]?.total_cost_usd;
    if (typeof cost === 'number') return cost;
  }
  return undefined;
}

function finalizeAgentRun(
  ctx: AppContext,
  agent: Agent,
  result: { result: string; sessionId: string | null; events?: Array<{ total_cost_usd?: number }>; stopped?: boolean },
  assistantText: string,
  extras: MessageMetadata = {},
): Message {
  const status = agent.status === 'stopped' || agent.status === 'archived' ? agent.status : 'idle';
  ctx.repos.agents.update(
    clearAgentRunFields(agent, {
      claudeSessionId: result.sessionId ?? agent.claudeSessionId,
      status,
    }),
  );

  const content = result.result || assistantText;
  const metadata: MessageMetadata = {
    ...extras,
    costUsd: extras.costUsd ?? extractCostUsd(result.events ?? []),
    stopped: extras.stopped ?? result.stopped,
  };

  const messages = ctx.repos.messages.listByAgent(agent.id);
  const last = messages[messages.length - 1];
  if (last?.role === 'assistant' && last.content === content && !metadata.stopped && !metadata.error) {
    return last;
  }

  const assistantMessage: Message = {
    id: uuidv4(),
    agentId: agent.id,
    role: 'assistant',
    content: content || (metadata.stopped ? '[stopped]' : '[no output]'),
    attachments: [],
    metadata,
    createdAt: nowIso(),
  };
  ctx.repos.messages.create(assistantMessage);
  return assistantMessage;
}

const ALLOWED_IMAGE_MIME = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp']);

function extensionForMime(mimeType: string): string {
  switch (mimeType) {
    case 'image/png':
      return 'png';
    case 'image/jpeg':
    case 'image/jpg':
      return 'jpg';
    case 'image/gif':
      return 'gif';
    case 'image/webp':
      return 'webp';
    default:
      return 'bin';
  }
}

async function saveChatImages(
  ctx: AppContext,
  agentId: string,
  images: ChatImageAttachment[] | undefined,
): Promise<MessageAttachment[]> {
  if (!images?.length) return [];

  const dir = path.join(ctx.dataDir, 'attachments', agentId);
  await fs.mkdir(dir, { recursive: true });

  const saved: MessageAttachment[] = [];
  for (const image of images) {
    if (!ALLOWED_IMAGE_MIME.has(image.mimeType)) {
      throw new Error(`Unsupported image type: ${image.mimeType}`);
    }
    if (!image.dataBase64 || image.dataBase64.length > 8_000_000) {
      throw new Error('Image payload is missing or too large (max ~6MB decoded)');
    }

    const id = uuidv4();
    const ext = extensionForMime(image.mimeType);
    const filePath = path.join(dir, `${id}.${ext}`);
    await fs.writeFile(filePath, Buffer.from(image.dataBase64, 'base64'));

    saved.push({
      id,
      type: 'image',
      mimeType: image.mimeType,
      name: image.name || `image.${ext}`,
      path: filePath,
      url: `/api/agents/${agentId}/attachments/${id}`,
    });
  }
  return saved;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Re-attach to Claude processes that outlived a previous orchestrator process.
 * Completes message/session persistence when those runs finish.
 */
export function recoverRunningAgents(ctx: AppContext): void {
  const running = ctx.repos.agents.listRunning();
  for (const agent of running) {
    void recoverOneAgent(ctx, agent);
  }
}

async function recoverOneAgent(ctx: AppContext, agent: Agent): Promise<void> {
  if (agent.pid == null || !agent.runLogPath) {
    ctx.repos.agents.update(clearAgentRunFields(agent, { status: 'idle' }));
    return;
  }

  if (!isPidAlive(agent.pid)) {
    // Process already finished — parse whatever is in the log and finalize.
    try {
      const result = await ctx.claude.attachToRun(
        agent.id,
        { pid: agent.pid, logPath: agent.runLogPath },
        { sessionId: agent.claudeSessionId },
      );
      finalizeAgentRun(ctx, agent, result, '');
    } catch {
      ctx.repos.agents.update(clearAgentRunFields(agent, { status: 'idle' }));
    }
    return;
  }

  try {
    let assistantText = '';
    const result = await ctx.claude.attachToRun(
      agent.id,
      { pid: agent.pid, logPath: agent.runLogPath },
      {
        sessionId: agent.claudeSessionId,
        onEvent: (event) => {
          if (
            event.type === 'stream_event' &&
            event.event?.delta?.type === 'text_delta' &&
            event.event.delta.text
          ) {
            assistantText += event.event.delta.text;
          } else if (event.type !== 'stderr') {
            ctx.repos.events.create(makeEvent(agent.id, event.type, event as Record<string, unknown>));
          }
        },
      },
    );
    finalizeAgentRun(ctx, agent, result, assistantText);
  } catch (error) {
    console.error(`Failed to recover agent ${agent.id}:`, error);
    ctx.repos.agents.update(clearAgentRunFields(agent, { status: 'idle' }));
  }
}

export async function streamAgentChat(
  ctx: AppContext,
  agentId: string,
  body: ChatRequest,
  res: Response,
) {
  const detail = await getAgentDetail(ctx, agentId);
  if (detail.archivedAt) {
    throw new Error('Cannot chat with archived agent');
  }

  const force = Boolean(body.force);
  const message = body.message.trim();
  if (!message && !(body.images && body.images.length > 0)) {
    throw new Error('Message or image attachment required');
  }

  if (detail.status === 'running' && detail.pid != null) {
    if (!force) {
      throw new Error('Agent already has a running Claude process. Queue the message or force-send.');
    }
    const pid = detail.pid;
    ctx.claude.stop(agentId, pid);
    const deadline = Date.now() + 5_000;
    while (isPidAlive(pid) && Date.now() < deadline) {
      await sleep(100);
    }
    await sleep(150);
    const afterStop = ctx.repos.agents.getById(agentId) ?? detail;
    if (afterStop.status === 'running' || afterStop.pid != null) {
      ctx.repos.agents.update(clearAgentRunFields(afterStop, { status: 'idle' }));
    }
  }

  const attachments = await saveChatImages(ctx, agentId, body.images);

  const userMessage: Message = {
    id: uuidv4(),
    agentId,
    role: 'user',
    content: message || '(image attachment)',
    attachments,
    metadata: {},
    createdAt: nowIso(),
  };
  ctx.repos.messages.create(userMessage);

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  // SSE disconnect / server shutdown must NOT kill the Claude process.
  let clientOpen = true;
  res.on('close', () => {
    clientOpen = false;
  });

  const send = (event: string, data: unknown) => {
    if (!clientOpen || res.writableEnded) return;
    try {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    } catch {
      clientOpen = false;
    }
  };

  send('user_message', userMessage);

  let runningAgent: Agent = {
    ...(ctx.repos.agents.getById(agentId) ?? detail),
    status: 'running',
    updatedAt: nowIso(),
  };
  ctx.repos.agents.update(runningAgent);

  let assistantText = '';
  const startedAt = Date.now();

  try {
    const result = await ctx.claude.runStreaming(agentId, {
      cwd: detail.worktree.path,
      prompt: userMessage.content,
      model: runningAgent.model,
      environment: runningAgent.environment,
      permissionMode: runningAgent.permissionMode,
      sessionId: runningAgent.claudeSessionId,
      imagePaths: attachments.map((item) => item.path),
      onStarted: (handle) => {
        runningAgent = {
          ...runningAgent,
          pid: handle.pid,
          runLogPath: handle.logPath,
          updatedAt: nowIso(),
        };
        ctx.repos.agents.update(runningAgent);
      },
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

    const current = ctx.repos.agents.getById(agentId) ?? runningAgent;
    const assistantMessage = finalizeAgentRun(ctx, current, result, assistantText, {
      durationMs: Date.now() - startedAt,
      stopped: result.stopped,
    });
    send('done', { message: assistantMessage, sessionId: result.sessionId });
  } catch (error) {
    const current = ctx.repos.agents.getById(agentId) ?? runningAgent;
    const errMessage = error instanceof Error ? error.message : 'Unknown error';

    if (assistantText.trim()) {
      const partial = finalizeAgentRun(
        ctx,
        current,
        { result: assistantText, sessionId: current.claudeSessionId, stopped: true },
        assistantText,
        { error: errMessage, stopped: true, durationMs: Date.now() - startedAt },
      );
      send('done', { message: partial, sessionId: current.claudeSessionId });
    } else {
      ctx.repos.agents.update(clearAgentRunFields(current, { status: 'idle' }));
      send('error', { message: errMessage });
    }
  } finally {
    if (clientOpen && !res.writableEnded) {
      res.end();
    }
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
