import path from 'node:path';
import fs from 'node:fs/promises';
import { v4 as uuidv4 } from 'uuid';
import type { Response } from 'express';
import type {
  Agent,
  AgentDetail,
  AgentEvent,
  AllowPermissionRequest,
  AnswerAskUserQuestionRequest,
  BuildPlanRequest,
  ChatImageAttachment,
  ChatRequest,
  RewindChatRequest,
  RewindChatResponse,
  CreateAgentFromPrRequest,
  CreatePrRequest,
  CreateWorktreeFromBranchRequest,
  CreateWorktreeFromIdeaRequest,
  CreateWorktreeFromPrRequest,
  CreateWorkspaceRequest,
  DenyPermissionRequest,
  InboxPullRequest,
  Message,
  MessageAttachment,
  MessageMetadata,
  PermissionRequest,
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
import {
  appendStreamText,
  applyStreamEvent,
  extractPlanFromInput,
  parseAskUserQuestions,
  type StreamPart,
} from '@agent-orchestrator/shared';

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
    permissionMode: 'plan',
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

  const existing = ctx.repos.worktrees.getByWorkspaceAndPr(workspace.id, body.prNumber);
  if (existing) {
    let agent = ctx.repos.agents.getByWorktreeId(existing.id);
    if (!agent) {
      agent = await createAgentForWorktree(ctx, existing.id, `PR #${body.prNumber} agent`);
    }
    return { worktree: existing, agent };
  }

  const pr = await ctx.github.getPullRequest(workspace.githubOwner, workspace.githubRepo, body.prNumber);
  const localBranch = `pr-${body.prNumber}`;
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
    permissionMode: body.permissionMode ?? agent.permissionMode,
    updatedAt: nowIso(),
  };

  ctx.repos.agents.update(updated);
  return updated;
}

export async function stopAgent(ctx: AppContext, agentId: string) {
  const agent = ctx.repos.agents.getById(agentId);
  if (!agent) throw new Error('Agent not found');

  ctx.claude.stop(agentId, agent.pid);
  markStreamingAssistantStopped(ctx, agentId);
  // Return to idle so the next chat message can start a run without a manual Start.
  const updated: Agent = {
    ...agent,
    status: agent.archivedAt ? 'archived' : 'idle',
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
    // Every new session starts in plan mode.
    permissionMode: 'plan',
    updatedAt: nowIso(),
  });
  ctx.repos.events.create(makeEvent(agentId, 'chat_cleared', { cleared }));
  return { cleared };
}

/**
 * Rewind conversation to a user message: drop that turn and everything after,
 * reset the Claude session, and return the prompt for the composer draft.
 * Earlier messages remain in the UI; the next send starts a fresh Claude session.
 */
export async function rewindAgentChat(
  ctx: AppContext,
  agentId: string,
  body: RewindChatRequest,
): Promise<RewindChatResponse> {
  const agent = ctx.repos.agents.getById(agentId);
  if (!agent) throw new Error('Agent not found');
  if (agent.archivedAt) throw new Error('Cannot rewind chat for archived agent');
  if (agent.status === 'running') {
    throw new Error('Cannot rewind chat while the agent is running. Stop it first.');
  }

  const target = ctx.repos.messages.getById(agentId, body.messageId);
  if (!target) throw new Error('Message not found');
  if (target.role !== 'user') {
    throw new Error('Rewind is only supported from a user message');
  }

  const all = ctx.repos.messages.listByAgent(agentId);
  const index = all.findIndex((item) => item.id === body.messageId);
  if (index < 0) throw new Error('Message not found');
  const dropped = all.slice(index);

  const { removed, target: deleted } = ctx.repos.messages.deleteFrom(agentId, body.messageId);
  if (!deleted || removed === 0) throw new Error('Message not found');

  await cleanupMessageAttachments(dropped);

  ctx.repos.agents.update({
    ...agent,
    claudeSessionId: null,
    updatedAt: nowIso(),
  });
  ctx.repos.events.create(
    makeEvent(agentId, 'chat_rewound', {
      messageId: body.messageId,
      removed,
    }),
  );

  return {
    removed,
    draft: deleted.content === '(image attachment)' ? '' : deleted.content,
    messageId: body.messageId,
  };
}

async function cleanupMessageAttachments(messages: Message[]): Promise<void> {
  for (const message of messages) {
    for (const attachment of message.attachments ?? []) {
      if (!attachment.path) continue;
      try {
        await fs.unlink(attachment.path);
      } catch {
        // best-effort cleanup
      }
    }
  }
}

export function listPendingPermissions(ctx: AppContext, agentId: string): PermissionRequest[] {
  const agent = ctx.repos.agents.getById(agentId);
  if (!agent) throw new Error('Agent not found');
  return ctx.claude.listPendingPermissions(agentId).map((item) => ({
    requestId: item.requestId,
    toolName: item.toolName,
    input: item.input,
    toolUseId: item.toolUseId,
    createdAt: nowIso(),
  }));
}

export async function answerAskUserQuestion(
  ctx: AppContext,
  agentId: string,
  body: AnswerAskUserQuestionRequest,
): Promise<{ ok: true }> {
  const agent = ctx.repos.agents.getById(agentId);
  if (!agent) throw new Error('Agent not found');

  const pending = ctx.claude
    .listPendingPermissions(agentId)
    .find((item) => item.requestId === body.requestId);
  if (!pending) throw new Error('Permission request not found');
  if (pending.toolName !== 'AskUserQuestion') {
    throw new Error('Permission request is not AskUserQuestion');
  }

  const questions = parseAskUserQuestions(pending.input);
  const updatedInput: Record<string, unknown> = {
    ...pending.input,
    questions: questions.length > 0 ? questions : pending.input.questions,
    answers: body.answers,
  };
  if (body.response?.trim()) {
    updatedInput.response = body.response.trim();
  }

  const ok = ctx.claude.respondToPermission(agentId, body.requestId, {
    behavior: 'allow',
    updatedInput,
  });
  if (!ok) throw new Error('Failed to send answers to Claude');

  ctx.repos.events.create(
    makeEvent(agentId, 'ask_user_question_answered', {
      requestId: body.requestId,
      answers: body.answers,
      response: body.response ?? null,
    }),
  );
  return { ok: true };
}

export async function allowPermissionRequest(
  ctx: AppContext,
  agentId: string,
  body: AllowPermissionRequest,
): Promise<{ ok: true }> {
  const agent = ctx.repos.agents.getById(agentId);
  if (!agent) throw new Error('Agent not found');

  const pending = ctx.claude
    .listPendingPermissions(agentId)
    .find((item) => item.requestId === body.requestId);
  if (!pending) throw new Error('Permission request not found');
  if (pending.toolName === 'AskUserQuestion') {
    throw new Error('Use the answer endpoint for AskUserQuestion');
  }
  if (pending.toolName === 'ExitPlanMode') {
    throw new Error('Use Build to approve ExitPlanMode (avoids CLI stdio hang)');
  }

  const ok = ctx.claude.respondToPermission(agentId, body.requestId, {
    behavior: 'allow',
    updatedInput: body.updatedInput ?? pending.input,
  });
  if (!ok) throw new Error('Permission request not found or Claude stdin unavailable');

  ctx.repos.events.create(
    makeEvent(agentId, 'permission_allowed', {
      requestId: body.requestId,
      toolName: pending.toolName,
    }),
  );
  return { ok: true };
}

export async function denyPermissionRequest(
  ctx: AppContext,
  agentId: string,
  body: DenyPermissionRequest,
): Promise<{ ok: true }> {
  const agent = ctx.repos.agents.getById(agentId);
  if (!agent) throw new Error('Agent not found');

  const message = body.message?.trim() || 'User declined this request. Continue planning.';
  const ok = ctx.claude.respondToPermission(agentId, body.requestId, {
    behavior: 'deny',
    message,
  });
  if (!ok) throw new Error('Permission request not found or Claude stdin unavailable');

  ctx.repos.events.create(
    makeEvent(agentId, 'permission_denied', {
      requestId: body.requestId,
      message,
    }),
  );
  return { ok: true };
}

async function resolvePlanText(
  ctx: AppContext,
  agentId: string,
  body: BuildPlanRequest,
): Promise<string> {
  if (body.plan?.trim()) return body.plan.trim();

  if (body.requestId) {
    const pending = ctx.claude
      .listPendingPermissions(agentId)
      .find((item) => item.requestId === body.requestId);
    if (pending) {
      const fromInput = extractPlanFromInput(pending.input);
      if (fromInput) return fromInput;

      const planFilePath =
        typeof pending.input.planFilePath === 'string' ? pending.input.planFilePath : null;
      if (planFilePath) {
        try {
          const text = await fs.readFile(planFilePath, 'utf8');
          if (text.trim()) return text.trim();
        } catch {
          // fall through
        }
      }
    }
  }

  // Last resort: use the most recent assistant message as the plan body.
  const messages = ctx.repos.messages.listByAgent(agentId);
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message?.role === 'assistant' && message.content.trim()) {
      return message.content.trim();
    }
  }

  throw new Error('No plan content available to build');
}

/**
 * Exit plan mode via Build: stop the current run, clear the session, switch to auto,
 * and start implementing the approved plan.
 */
export async function buildApprovedPlan(
  ctx: AppContext,
  agentId: string,
  body: BuildPlanRequest,
  res: Response,
): Promise<void> {
  const detail = await getAgentDetail(ctx, agentId);
  if (detail.archivedAt) throw new Error('Cannot build with archived agent');

  const plan = await resolvePlanText(ctx, agentId, body);

  if (body.requestId) {
    ctx.claude.dismissPermission(agentId, body.requestId);
  }

  // Stop any in-flight plan-mode run (avoids ExitPlanMode stdio hang on approve).
  if (detail.status === 'running' && detail.pid != null) {
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

  const agent = ctx.repos.agents.getById(agentId);
  if (!agent) throw new Error('Agent not found');

  ctx.repos.messages.deleteByAgent(agentId);
  ctx.repos.agents.update({
    ...agent,
    claudeSessionId: null,
    permissionMode: 'auto',
    status: 'idle',
    pid: null,
    runLogPath: null,
    updatedAt: nowIso(),
  });
  ctx.repos.events.create(
    makeEvent(agentId, 'plan_build_started', {
      requestId: body.requestId ?? null,
      planLength: plan.length,
    }),
  );

  const implementPrompt = [
    'The user approved the following plan. Implement it now in auto mode.',
    'Do not ask clarifying questions unless blocked. Prefer making progress with sensible defaults.',
    '',
    '## Approved plan',
    '',
    plan,
  ].join('\n');

  await streamAgentChat(
    ctx,
    agentId,
    { message: implementPrompt, force: true },
    res,
  );
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
  // Runs auto-start on chat send and auto-stop when the process ends.
  // Preserve archived; otherwise always return to idle (including user interrupts).
  const status = agent.status === 'archived' ? agent.status : 'idle';
  ctx.repos.agents.update(
    clearAgentRunFields(agent, {
      claudeSessionId: result.sessionId ?? agent.claudeSessionId,
      status,
    }),
  );

  const content = result.result || assistantText;
  const metadata: MessageMetadata = {
    ...extras,
    streaming: false,
    costUsd: extras.costUsd ?? extractCostUsd(result.events ?? []),
    stopped: extras.stopped ?? result.stopped,
  };

  const messages = ctx.repos.messages.listByAgent(agent.id);
  const last = messages[messages.length - 1];

  // Prefer updating the in-progress assistant row written during the stream.
  if (last?.role === 'assistant' && (last.metadata?.streaming || last.content === content)) {
    const updated: Message = {
      ...last,
      content: content || (metadata.stopped ? '[stopped]' : last.content || '[no output]'),
      metadata: {
        ...last.metadata,
        ...metadata,
        timeline: metadata.timeline ?? last.metadata.timeline,
        streaming: false,
      },
    };
    return ctx.repos.messages.update(updated);
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

function markStreamingAssistantStopped(ctx: AppContext, agentId: string): void {
  const messages = ctx.repos.messages.listByAgent(agentId);
  const last = messages[messages.length - 1];
  if (last?.role !== 'assistant' || !last.metadata?.streaming) return;
  ctx.repos.messages.update({
    ...last,
    content: last.content || '[stopped]',
    metadata: { ...last.metadata, streaming: false, stopped: true },
  });
}

/** Persist partial assistant output so remounted UIs can load history from the API. */
function persistAssistantProgress(
  ctx: AppContext,
  message: Message,
  content: string,
  timeline: StreamPart[],
): Message {
  const next: Message = {
    ...message,
    content,
    metadata: {
      ...message.metadata,
      streaming: true,
      timeline,
    },
  };
  return ctx.repos.messages.update(next);
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
    markStreamingAssistantStopped(ctx, agent.id);
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
      markStreamingAssistantStopped(ctx, agent.id);
      ctx.repos.agents.update(clearAgentRunFields(agent, { status: 'idle' }));
    }
    return;
  }

  try {
    let assistantText = '';
    let timeline: StreamPart[] = [];
    let lastPersistAt = 0;
    const messages = ctx.repos.messages.listByAgent(agent.id);
    let assistantMessage = messages[messages.length - 1];
    if (assistantMessage?.role !== 'assistant' || !assistantMessage.metadata?.streaming) {
      assistantMessage = {
        id: uuidv4(),
        agentId: agent.id,
        role: 'assistant',
        content: '',
        attachments: [],
        metadata: { streaming: true, timeline: [] },
        createdAt: nowIso(),
      };
      ctx.repos.messages.create(assistantMessage);
    } else {
      assistantText = assistantMessage.content;
      timeline = assistantMessage.metadata.timeline ?? [];
    }

    const flushProgress = (forcePersist = false) => {
      const now = Date.now();
      if (!forcePersist && now - lastPersistAt < 300) return;
      lastPersistAt = now;
      if (!assistantMessage) return;
      assistantMessage = persistAssistantProgress(ctx, assistantMessage, assistantText, timeline);
    };

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
            timeline = appendStreamText(timeline, event.event.delta.text);
            flushProgress();
          } else if (event.type !== 'stderr') {
            timeline = applyStreamEvent(timeline, event as Record<string, unknown>);
            flushProgress(true);
            ctx.repos.events.create(makeEvent(agent.id, event.type, event as Record<string, unknown>));
          }
        },
      },
    );
    flushProgress(true);
    finalizeAgentRun(ctx, agent, result, assistantText, { timeline });
  } catch (error) {
    console.error(`Failed to recover agent ${agent.id}:`, error);
    markStreamingAssistantStopped(ctx, agent.id);
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
    markStreamingAssistantStopped(ctx, agentId);
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

  let assistantMessage: Message = {
    id: uuidv4(),
    agentId,
    role: 'assistant',
    content: '',
    attachments: [],
    metadata: { streaming: true, timeline: [] },
    createdAt: nowIso(),
  };
  ctx.repos.messages.create(assistantMessage);

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
  send('assistant_message', assistantMessage);

  let runningAgent: Agent = {
    ...(ctx.repos.agents.getById(agentId) ?? detail),
    status: 'running',
    updatedAt: nowIso(),
  };
  ctx.repos.agents.update(runningAgent);

  let assistantText = '';
  let timeline: StreamPart[] = [];
  let lastPersistAt = 0;
  const startedAt = Date.now();

  const flushProgress = (forcePersist = false) => {
    const now = Date.now();
    if (!forcePersist && now - lastPersistAt < 300) return;
    lastPersistAt = now;
    assistantMessage = persistAssistantProgress(ctx, assistantMessage, assistantText, timeline);
  };

  try {
    const result = await ctx.claude.runStreaming(agentId, {
      cwd: detail.worktree.path,
      prompt: userMessage.content,
      model: runningAgent.model,
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
      onPermissionRequest: (request) => {
        const payload: PermissionRequest = {
          requestId: request.requestId,
          toolName: request.toolName,
          input: request.input,
          toolUseId: request.toolUseId,
          createdAt: nowIso(),
        };
        ctx.repos.events.create(
          makeEvent(agentId, 'permission_request', payload as unknown as Record<string, unknown>),
        );
        send('permission_request', payload);
      },
      onEvent: (event) => {
        if (
          event.type === 'stream_event' &&
          event.event?.delta?.type === 'text_delta' &&
          event.event.delta.text
        ) {
          assistantText += event.event.delta.text;
          timeline = appendStreamText(timeline, event.event.delta.text);
          flushProgress();
          send('token', { text: event.event.delta.text });
        } else if (event.type !== 'stderr') {
          timeline = applyStreamEvent(timeline, event as Record<string, unknown>);
          flushProgress(true);
          ctx.repos.events.create(makeEvent(agentId, event.type, event as Record<string, unknown>));
          send('event', event);
        }
      },
    });

    flushProgress(true);
    const current = ctx.repos.agents.getById(agentId) ?? runningAgent;
    const finalized = finalizeAgentRun(ctx, current, result, assistantText, {
      durationMs: Date.now() - startedAt,
      stopped: result.stopped,
      timeline,
    });
    send('done', { message: finalized, sessionId: result.sessionId });
  } catch (error) {
    const current = ctx.repos.agents.getById(agentId) ?? runningAgent;
    const errMessage = error instanceof Error ? error.message : 'Unknown error';
    flushProgress(true);

    if (assistantText.trim() || timeline.length > 0) {
      const partial = finalizeAgentRun(
        ctx,
        current,
        { result: assistantText, sessionId: current.claudeSessionId, stopped: true },
        assistantText,
        {
          error: errMessage,
          stopped: true,
          durationMs: Date.now() - startedAt,
          timeline,
        },
      );
      send('done', { message: partial, sessionId: current.claudeSessionId });
    } else {
      // Remove empty placeholder assistant row on hard failure before any output.
      ctx.repos.messages.deleteFrom(agentId, assistantMessage.id);
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

/**
 * Suggest a branch name from the idea, create a new worktree + agent, and return both.
 * The client should kick off chat with the idea as the first prompt (plan mode asks clarifying questions).
 */
export async function createWorktreeFromIdea(
  ctx: AppContext,
  workspaceId: string,
  body: CreateWorktreeFromIdeaRequest,
) {
  const idea = body.idea.trim();
  if (!idea) throw new Error('Idea is required');

  const branchName = await suggestBranchNameForWorkspace(ctx, workspaceId, idea);
  const { worktree, agent } = await createWorktreeFromBranch(ctx, workspaceId, {
    branch: branchName,
    createNew: true,
    baseBranch: body.baseBranch,
    name: body.name,
  });

  return { worktree, agent, branchName, idea };
}

export async function getSystemStatus(ctx: AppContext) {
  const claudeInstalled = await ctx.claude.checkInstalled();
  return {
    claudeInstalled,
    claudeBin: process.env.CLAUDE_BIN ?? 'claude',
    githubTokenConfigured: Boolean(process.env.GITHUB_TOKEN),
  };
}
