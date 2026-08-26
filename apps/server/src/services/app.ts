import path from 'node:path';
import fs from 'node:fs/promises';
import { v4 as uuidv4 } from 'uuid';
import type { Response } from 'express';
import type {
  Agent,
  AgentDetail,
  AgentDiffScope,
  AgentEvent,
  AllowPermissionRequest,
  AnswerAskUserQuestionRequest,
  ArchiveAgentRequest,
  ArchiveAgentResponse,
  BuildPlanRequest,
  ChatImageAttachment,
  ChatRequest,
  ChatSession,
  ChatSessionTemplateId,
  CreateChatSessionRequest,
  RewindChatRequest,
  RewindChatResponse,
  CreateAgentFromPrRequest,
  CreatePrRequest,
  CreateWorktreeFromBranchRequest,
  CreateWorktreeFromIdeaRequest,
  CreateWorktreeFromPrRequest,
  CreateWorkspaceRequest,
  DenyPermissionRequest,
  EffortLevel,
  GenerateInstructionDraftRequest,
  ApplyInstructionFileRequest,
  GradeChatSessionRequest,
  InboxPullRequest,
  MergePullRequestRequest,
  Message,
  MessageAttachment,
  MessageMetadata,
  PermissionMode,
  PermissionRequest,
  PruneArchivedAgentsResponse,
  PullRequestChecks,
  PullRequestDetail,
  PullRequestInbox,
  SetPullRequestStateRequest,
  UpdateAgentRequest,
  UpdateChatSessionRequest,
  UpdatePullRequestBranchRequest,
  SidebarWorkspace,
  Workspace,
  Worktree,
  WorktreeWithAgent,
  WorkspaceWithCounts,
} from '@agent-orchestrator/shared';
import {
  DEFAULT_EFFORT_LEVEL,
  DEFAULT_PERMISSION_MODE,
  buildImplementPlanPrompt,
  chatSessionTemplateById,
} from '@agent-orchestrator/shared';
import type { AppRepositories } from '../db/index.js';
import { ClaudeService, GitService, enrichPermissionInput, isPidAlive, parseGitHubUrl, slugify } from '../services/git.js';
import { GitHubService, type SearchedPullRequest } from '../services/github.js';
import { AnthropicService } from '../services/anthropic.js';
import { discoverSlashCommands } from '../services/slash-commands.js';
import { mergeLivePullRequest } from '../services/pr-overlay.js';
import { buildSessionTranscript } from '../services/session-transcript.js';
import {
  applyInstructionFile,
  listInstructionFiles,
  loadInstructionFileExcerpts,
  readInstructionFileContent,
  type InstructionFileRoots,
} from '../services/instruction-files.js';
import { buildSessionGradeContext } from '../services/session-grade.js';
import {
  appendStreamText,
  applyStreamEvent,
  extractPlanFromInput,
  buildAskUserQuestionUpdatedInput,
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
  options?: { model?: string; effort?: EffortLevel; permissionMode?: PermissionMode },
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
    model: options?.model?.trim() || 'sonnet',
    effort: options?.effort ?? DEFAULT_EFFORT_LEVEL,
    permissionMode: options?.permissionMode ?? DEFAULT_PERMISSION_MODE,
    claudeSessionId: null,
    pid: null,
    runLogPath: null,
    activeSessionId: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    archivedAt: null,
  };

  ctx.repos.agents.create(agent);
  const session = createSessionForAgent(ctx, agent, {
    template: 'chat',
    permissionMode: agent.permissionMode,
  });
  return { ...agent, activeSessionId: session.id };
}

function uniqueSessionTitle(existing: ChatSession[], base: string): string {
  const titles = new Set(existing.map((item) => item.title));
  if (!titles.has(base)) return base;
  let n = 2;
  while (titles.has(`${base} ${n}`)) n += 1;
  return `${base} ${n}`;
}

function createSessionForAgent(
  ctx: AppContext,
  agent: Agent,
  options: {
    title?: string;
    template?: ChatSessionTemplateId;
    permissionMode?: PermissionMode;
    activate?: boolean;
  } = {},
): ChatSession {
  const template = chatSessionTemplateById(options.template ?? 'chat');
  const timestamp = nowIso();
  const existing = ctx.repos.sessions.listByAgent(agent.id);
  const title = options.title?.trim() || uniqueSessionTitle(existing, template?.title ?? 'Chat');
  const session: ChatSession = {
    id: uuidv4(),
    agentId: agent.id,
    title,
    template: template?.id ?? 'chat',
    status: 'idle',
    model: agent.model,
    effort: agent.effort,
    permissionMode: options.permissionMode ?? template?.permissionMode ?? DEFAULT_PERMISSION_MODE,
    claudeSessionId: null,
    pid: null,
    runLogPath: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  ctx.repos.sessions.create(session);
  if (options.activate !== false) {
    ctx.repos.agents.update({
      ...ctx.repos.agents.getById(agent.id)!,
      activeSessionId: session.id,
      permissionMode: session.permissionMode,
      updatedAt: timestamp,
    });
  }
  return session;
}

function requireAgent(ctx: AppContext, agentId: string): Agent {
  const agent = ctx.repos.agents.getById(agentId);
  if (!agent) throw new Error('Agent not found');
  return agent;
}

function requireSession(ctx: AppContext, agentId: string, sessionId?: string | null): ChatSession {
  const agent = requireAgent(ctx, agentId);
  let id = sessionId || agent.activeSessionId;
  if (!id) {
    const existing = ctx.repos.sessions.listByAgent(agentId);
    if (existing[0]) {
      id = existing[0].id;
      ctx.repos.agents.update({ ...agent, activeSessionId: id, updatedAt: nowIso() });
    } else {
      return createSessionForAgent(ctx, agent);
    }
  }
  const session = ctx.repos.sessions.getById(id);
  if (!session || session.agentId !== agentId) throw new Error('Session not found');
  return session;
}

/** Roll up session run state onto the agent (status, active-session snapshot). */
function syncAgentFromSessions(ctx: AppContext, agentId: string): Agent {
  const agent = requireAgent(ctx, agentId);
  const sessions = ctx.repos.sessions.listByAgent(agentId);
  const anyRunning = sessions.some((item) => item.status === 'running');
  const active =
    sessions.find((item) => item.id === agent.activeSessionId) ?? sessions[0] ?? null;
  return ctx.repos.agents.update({
    ...agent,
    status: agent.archivedAt ? 'archived' : anyRunning ? 'running' : 'idle',
    pid: active?.pid ?? null,
    runLogPath: active?.runLogPath ?? null,
    claudeSessionId: active?.claudeSessionId ?? null,
    permissionMode: active?.permissionMode ?? agent.permissionMode,
    model: active?.model ?? agent.model,
    effort: active?.effort ?? agent.effort,
    activeSessionId: active?.id ?? agent.activeSessionId,
    updatedAt: nowIso(),
  });
}

function clearSessionRunFields(
  session: ChatSession,
  overrides: Partial<ChatSession> = {},
): ChatSession {
  return {
    ...session,
    ...overrides,
    pid: null,
    runLogPath: null,
    updatedAt: nowIso(),
  };
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

  for (const agent of ctx.repos.agents.listByWorktreeId(worktreeId)) {
    await stopAllSessions(ctx, agent);
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
  const sessions = ctx.repos.sessions.listByAgent(agentId);
  let activeSessionId = agent.activeSessionId;
  if (!activeSessionId || !sessions.some((item) => item.id === activeSessionId)) {
    const session = sessions[0] ?? createSessionForAgent(ctx, agent);
    activeSessionId = session.id;
    if (!sessions.some((item) => item.id === session.id)) {
      sessions.push(session);
    }
    ctx.repos.agents.update({ ...agent, activeSessionId, updatedAt: nowIso() });
  }
  return {
    ...agent,
    activeSessionId,
    worktree: liveWorktree,
    workspace,
    sessions: ctx.repos.sessions.listByAgent(agentId),
  };
}

export async function updateAgent(ctx: AppContext, agentId: string, body: UpdateAgentRequest) {
  const agent = ctx.repos.agents.getById(agentId);
  if (!agent) throw new Error('Agent not found');
  if (agent.archivedAt) throw new Error('Cannot update archived agent');

  const updated: Agent = {
    ...agent,
    name: body.name ?? agent.name,
    model: body.model ?? agent.model,
    effort: body.effort ?? agent.effort,
    permissionMode: body.permissionMode ?? agent.permissionMode,
    updatedAt: nowIso(),
  };

  ctx.repos.agents.update(updated);

  // Composer model / permission changes apply to the active session.
  if (body.model || body.effort || body.permissionMode) {
    const session = requireSession(ctx, agentId);
    ctx.repos.sessions.update({
      ...session,
      model: body.model ?? session.model,
      effort: body.effort ?? session.effort,
      permissionMode: body.permissionMode ?? session.permissionMode,
      updatedAt: nowIso(),
    });
    return syncAgentFromSessions(ctx, agentId);
  }

  return updated;
}

async function stopAllSessions(ctx: AppContext, agent: Agent): Promise<void> {
  const sessions = ctx.repos.sessions.listByAgent(agent.id);
  for (const session of sessions) {
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

export async function stopAgent(ctx: AppContext, agentId: string) {
  const agent = ctx.repos.agents.getById(agentId);
  if (!agent) throw new Error('Agent not found');

  await stopAllSessions(ctx, agent);
  const updated = syncAgentFromSessions(ctx, agentId);
  ctx.repos.events.create(makeEvent(agentId, 'agent_stopped', {}));
  return updated;
}

export async function stopAgentSession(ctx: AppContext, agentId: string, sessionId: string) {
  const session = requireSession(ctx, agentId, sessionId);
  ctx.claude.stop(session.id, session.pid, session.runLogPath);
  markStreamingAssistantStopped(ctx, agentId, session.id);
  ctx.repos.sessions.update(
    clearSessionRunFields(session, {
      status: 'idle',
    }),
  );
  const updated = syncAgentFromSessions(ctx, agentId);
  ctx.repos.events.create(makeEvent(agentId, 'session_stopped', { sessionId }));
  return updated;
}

export async function archiveAgent(
  ctx: AppContext,
  agentId: string,
  body: ArchiveAgentRequest = {},
): Promise<ArchiveAgentResponse> {
  const agent = ctx.repos.agents.getById(agentId);
  if (!agent) throw new Error('Agent not found');

  await stopAllSessions(ctx, agent);

  if (body.deleteWorktree) {
    await deleteWorktree(ctx, agent.worktreeId);
    return { agent: null, deletedWorktree: true };
  }
  const updated: Agent = {
    ...syncAgentFromSessions(ctx, agentId),
    status: 'archived',
    pid: null,
    runLogPath: null,
    archivedAt: nowIso(),
    updatedAt: nowIso(),
  };
  ctx.repos.agents.update(updated);
  ctx.repos.events.create(makeEvent(agentId, 'agent_archived', {}));
  return { agent: updated, deletedWorktree: false };
}

/**
 * Permanently remove archived agents. Worktrees are deleted only when they
 * have no remaining active agent; otherwise only the archived agent rows go.
 */
export async function pruneArchivedAgents(ctx: AppContext): Promise<PruneArchivedAgentsResponse> {
  const archived = ctx.repos.agents.listArchived();
  let prunedAgents = 0;
  let deletedWorktrees = 0;
  const worktreeIds = [...new Set(archived.map((agent) => agent.worktreeId))];

  for (const worktreeId of worktreeIds) {
    const archivedOnTree = archived.filter((agent) => agent.worktreeId === worktreeId);
    for (const agent of archivedOnTree) {
      await stopAllSessions(ctx, agent);
    }

    const active = ctx.repos.agents.getByWorktreeId(worktreeId);
    if (active) {
      for (const agent of archivedOnTree) {
        ctx.repos.agents.delete(agent.id);
        prunedAgents += 1;
      }
      continue;
    }

    if (!ctx.repos.worktrees.getById(worktreeId)) {
      for (const agent of archivedOnTree) {
        ctx.repos.agents.delete(agent.id);
        prunedAgents += 1;
      }
      continue;
    }

    await deleteWorktree(ctx, worktreeId);
    deletedWorktrees += 1;
    prunedAgents += archivedOnTree.length;
  }

  return { prunedAgents, deletedWorktrees };
}

export function listAgentSessions(ctx: AppContext, agentId: string): ChatSession[] {
  requireAgent(ctx, agentId);
  return ctx.repos.sessions.listByAgent(agentId);
}

export async function createAgentSession(
  ctx: AppContext,
  agentId: string,
  body: CreateChatSessionRequest = {},
): Promise<{ session: ChatSession; kickoffPrompt: string | null }> {
  const agent = requireAgent(ctx, agentId);
  if (agent.archivedAt) throw new Error('Cannot create a session on an archived agent');

  const template = chatSessionTemplateById(body.template ?? 'chat');
  if (body.template && !template) throw new Error('Unknown session template');

  const session = createSessionForAgent(ctx, agent, {
    template: template?.id ?? 'chat',
    title: body.title,
    permissionMode: template?.permissionMode,
    activate: true,
  });
  ctx.repos.events.create(
    makeEvent(agentId, 'session_created', {
      sessionId: session.id,
      template: session.template,
    }),
  );
  return { session, kickoffPrompt: template?.prompt ?? null };
}

export async function updateAgentSession(
  ctx: AppContext,
  agentId: string,
  sessionId: string,
  body: UpdateChatSessionRequest,
): Promise<ChatSession> {
  const agent = requireAgent(ctx, agentId);
  if (agent.archivedAt) throw new Error('Cannot update a session on an archived agent');
  const session = requireSession(ctx, agentId, sessionId);
  const updated = ctx.repos.sessions.update({
    ...session,
    title: body.title?.trim() || session.title,
    model: body.model ?? session.model,
    effort: body.effort ?? session.effort,
    permissionMode: body.permissionMode ?? session.permissionMode,
    updatedAt: nowIso(),
  });
  syncAgentFromSessions(ctx, agentId);
  return updated;
}

function instructionRoots(ctx: AppContext, agentId: string): InstructionFileRoots {
  const agent = requireAgent(ctx, agentId);
  const worktree = ctx.repos.worktrees.getById(agent.worktreeId);
  if (!worktree) throw new Error('Worktree not found');
  return { worktreePath: worktree.path };
}

export async function gradeAgentSession(
  ctx: AppContext,
  agentId: string,
  sessionId: string,
  body: GradeChatSessionRequest = {},
): Promise<ChatSession> {
  const session = requireSession(ctx, agentId, sessionId);
  const messages = ctx.repos.messages.listBySession(session.id);
  const liveTranscript = buildSessionTranscript(messages);
  const storedTranscript = ctx.repos.sessions.getGradeTranscript(session.id);
  const transcript = liveTranscript || storedTranscript;
  if (!transcript) {
    throw new Error('Cannot grade an empty session. Send a message first.');
  }

  const roots = instructionRoots(ctx, agentId);
  const [instructionFiles, skills] = await Promise.all([
    loadInstructionFileExcerpts(roots),
    discoverSlashCommands(roots.worktreePath),
  ]);

  const context = buildSessionGradeContext({
    messages,
    instructionFiles,
    skills,
    sessionTitle: session.title,
    model: session.model,
    permissionMode: session.permissionMode,
    notes: body.notes,
  });
  if (!context.transcript) {
    context.transcript = storedTranscript;
  }

  const result = await ctx.anthropic.analyzeSessionGrade(context);
  const graded = ctx.repos.sessions.setGrade(
    session.id,
    {
      score: result.score,
      comment: result.summary,
      gradedAt: nowIso(),
      analysis: {
        summary: result.summary,
        findings: result.findings,
        stats: result.stats,
      },
    },
    context.transcript || transcript,
  );
  ctx.repos.events.create(
    makeEvent(agentId, 'session_graded', {
      sessionId: session.id,
      score: result.score,
    }),
  );
  return graded;
}

export async function listAgentInstructionFiles(ctx: AppContext, agentId: string) {
  requireAgent(ctx, agentId);
  return listInstructionFiles(instructionRoots(ctx, agentId));
}

export async function generateAgentInstructionDraft(
  ctx: AppContext,
  agentId: string,
  sessionId: string,
  body: GenerateInstructionDraftRequest,
) {
  const session = requireSession(ctx, agentId, sessionId);
  const messages = ctx.repos.messages.listBySession(session.id);
  const transcript =
    buildSessionTranscript(messages) || ctx.repos.sessions.getGradeTranscript(session.id);
  if (!transcript) {
    throw new Error('Cannot generate instructions from an empty session.');
  }

  const roots = instructionRoots(ctx, agentId);
  let existingContent: string | null = null;
  if (body.relativePath) {
    existingContent = await readInstructionFileContent(roots, {
      kind: body.kind,
      scope: body.scope ?? 'project',
      relativePath: body.relativePath,
    });
  }

  const draft = await ctx.anthropic.generateInstructionDraft({
    transcript,
    score: session.grade?.score ?? null,
    comment: session.grade?.comment ?? '',
    analysis: session.grade?.analysis ?? null,
    request: body,
    existingContent,
    existingPath: body.relativePath ?? null,
  });
  ctx.repos.events.create(
    makeEvent(agentId, 'instruction_draft_generated', {
      sessionId: session.id,
      kind: draft.kind,
      relativePath: draft.relativePath,
    }),
  );
  return draft;
}

export async function applyAgentInstructionFile(
  ctx: AppContext,
  agentId: string,
  body: ApplyInstructionFileRequest,
) {
  requireAgent(ctx, agentId);
  const result = await applyInstructionFile(instructionRoots(ctx, agentId), body);
  ctx.repos.events.create(
    makeEvent(agentId, 'instruction_file_applied', {
      kind: result.kind,
      relativePath: result.relativePath,
      action: result.action,
    }),
  );
  return result;
}

export async function activateAgentSession(
  ctx: AppContext,
  agentId: string,
  sessionId: string,
): Promise<AgentDetail> {
  requireSession(ctx, agentId, sessionId);
  const agent = requireAgent(ctx, agentId);
  ctx.repos.agents.update({
    ...agent,
    activeSessionId: sessionId,
    updatedAt: nowIso(),
  });
  syncAgentFromSessions(ctx, agentId);
  return getAgentDetail(ctx, agentId);
}

export function getAgentMessages(
  ctx: AppContext,
  agentId: string,
  sessionId?: string,
): Message[] {
  const session = requireSession(ctx, agentId, sessionId);
  return ctx.repos.messages.listBySession(session.id);
}

export async function clearAgentChat(
  ctx: AppContext,
  agentId: string,
  sessionId?: string,
): Promise<{ cleared: number }> {
  const agent = ctx.repos.agents.getById(agentId);
  if (!agent) throw new Error('Agent not found');
  if (agent.archivedAt) throw new Error('Cannot clear chat for archived agent');
  const session = requireSession(ctx, agentId, sessionId);
  if (session.status === 'running') {
    throw new Error('Cannot clear chat while the session is running. Stop it first.');
  }

  const cleared = ctx.repos.messages.deleteBySession(session.id);
  ctx.repos.sessions.update({
    ...session,
    claudeSessionId: null,
    permissionMode: 'plan',
    updatedAt: nowIso(),
  });
  syncAgentFromSessions(ctx, agentId);
  ctx.repos.events.create(makeEvent(agentId, 'chat_cleared', { cleared, sessionId: session.id }));
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
  sessionId?: string,
): Promise<RewindChatResponse> {
  const agent = ctx.repos.agents.getById(agentId);
  if (!agent) throw new Error('Agent not found');
  if (agent.archivedAt) throw new Error('Cannot rewind chat for archived agent');

  const target = ctx.repos.messages.getById(agentId, body.messageId);
  if (!target) throw new Error('Message not found');
  if (target.role !== 'user') {
    throw new Error('Rewind is only supported from a user message');
  }

  const session = requireSession(ctx, agentId, sessionId ?? target.sessionId);
  if (session.status === 'running') {
    throw new Error('Cannot rewind chat while the session is running. Stop it first.');
  }

  const all = ctx.repos.messages.listBySession(session.id);
  const index = all.findIndex((item) => item.id === body.messageId);
  if (index < 0) throw new Error('Message not found');
  const dropped = all.slice(index);

  const { removed, target: deleted } = ctx.repos.messages.deleteFrom(agentId, body.messageId);
  if (!deleted || removed === 0) throw new Error('Message not found');

  await cleanupMessageAttachments(dropped);

  ctx.repos.sessions.update({
    ...session,
    claudeSessionId: null,
    updatedAt: nowIso(),
  });
  syncAgentFromSessions(ctx, agentId);
  ctx.repos.events.create(
    makeEvent(agentId, 'chat_rewound', {
      messageId: body.messageId,
      removed,
      sessionId: session.id,
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

function resolvePermissionSession(
  ctx: AppContext,
  agentId: string,
  sessionId: string | undefined,
  requestId?: string,
): ChatSession {
  if (sessionId) return requireSession(ctx, agentId, sessionId);
  if (requestId) {
    for (const session of ctx.repos.sessions.listByAgent(agentId)) {
      if (ctx.claude.listPendingPermissions(session.id).some((item) => item.requestId === requestId)) {
        return session;
      }
    }
  }
  return requireSession(ctx, agentId);
}

export function listPendingPermissions(
  ctx: AppContext,
  agentId: string,
  sessionId?: string,
): PermissionRequest[] {
  requireAgent(ctx, agentId);
  const session = requireSession(ctx, agentId, sessionId);
  return ctx.claude.listPendingPermissions(session.id).map((item) => ({
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
  sessionId?: string,
): Promise<{ ok: true }> {
  requireAgent(ctx, agentId);
  const session = resolvePermissionSession(ctx, agentId, sessionId, body.requestId);

  const pending = ctx.claude
    .listPendingPermissions(session.id)
    .find((item) => item.requestId === body.requestId);
  if (!pending) throw new Error('Permission request not found');
  if (pending.toolName !== 'AskUserQuestion') {
    throw new Error('Permission request is not AskUserQuestion');
  }

  // Claude Code requires the original questions array plus answers (and optional
  // freeform response). Re-normalizing questions can break tool validation.
  const updatedInput = buildAskUserQuestionUpdatedInput(pending.input, {
    answers: body.answers,
    response: body.response,
  });

  const ok = ctx.claude.respondToPermission(session.id, body.requestId, {
    behavior: 'allow',
    updatedInput,
  });
  if (!ok) throw new Error('Failed to send answers to Claude');

  ctx.repos.events.create(
    makeEvent(agentId, 'ask_user_question_answered', {
      requestId: body.requestId,
      answers: body.answers,
      response: body.response ?? null,
      sessionId: session.id,
    }),
  );
  return { ok: true };
}

export async function allowPermissionRequest(
  ctx: AppContext,
  agentId: string,
  body: AllowPermissionRequest,
  sessionId?: string,
): Promise<{ ok: true }> {
  requireAgent(ctx, agentId);
  const session = resolvePermissionSession(ctx, agentId, sessionId, body.requestId);

  const pending = ctx.claude
    .listPendingPermissions(session.id)
    .find((item) => item.requestId === body.requestId);
  if (!pending) throw new Error('Permission request not found');
  if (pending.toolName === 'AskUserQuestion') {
    throw new Error('Use the answer endpoint for AskUserQuestion');
  }
  if (pending.toolName === 'ExitPlanMode') {
    throw new Error('Use Build to approve ExitPlanMode (avoids CLI stdio hang)');
  }

  const ok = ctx.claude.respondToPermission(session.id, body.requestId, {
    behavior: 'allow',
    updatedInput: body.updatedInput ?? pending.input,
  });
  if (!ok) throw new Error('Permission request not found or Claude stdin unavailable');

  ctx.repos.events.create(
    makeEvent(agentId, 'permission_allowed', {
      requestId: body.requestId,
      toolName: pending.toolName,
      sessionId: session.id,
    }),
  );
  return { ok: true };
}

export async function denyPermissionRequest(
  ctx: AppContext,
  agentId: string,
  body: DenyPermissionRequest,
  sessionId?: string,
): Promise<{ ok: true }> {
  requireAgent(ctx, agentId);
  const session = resolvePermissionSession(ctx, agentId, sessionId, body.requestId);

  const pending = ctx.claude
    .listPendingPermissions(session.id)
    .find((item) => item.requestId === body.requestId);

  const message = body.message?.trim() || 'User declined this request. Continue planning.';

  // ExitPlanMode deny via stdio hangs (deferred tool). Stop the run instead and
  // keep the Claude session so the user can continue planning with a follow-up.
  if (pending?.toolName === 'ExitPlanMode') {
    ctx.claude.dismissPermission(session.id, body.requestId);
    await stopClaudeRun(ctx, session);
    markStreamingAssistantStopped(ctx, agentId, session.id);
    ctx.repos.events.create(
      makeEvent(agentId, 'permission_denied', {
        requestId: body.requestId,
        message,
        toolName: pending.toolName,
        sessionId: session.id,
      }),
    );
    return { ok: true };
  }

  const ok = ctx.claude.respondToPermission(session.id, body.requestId, {
    behavior: 'deny',
    message,
  });
  if (!ok) throw new Error('Permission request not found or Claude stdin unavailable');

  ctx.repos.events.create(
    makeEvent(agentId, 'permission_denied', {
      requestId: body.requestId,
      message,
      sessionId: session.id,
    }),
  );
  return { ok: true };
}

async function resolvePlanText(
  ctx: AppContext,
  agentId: string,
  session: ChatSession,
  body: BuildPlanRequest,
): Promise<string> {
  if (body.plan?.trim()) return body.plan.trim();

  if (body.requestId) {
    const pending = ctx.claude
      .listPendingPermissions(session.id)
      .find((item) => item.requestId === body.requestId);
    if (pending) {
      const enriched = enrichPermissionInput('ExitPlanMode', pending.input, {
        logPath: ctx.claude.getRunningProcess(session.id)?.logPath ?? session.runLogPath ?? undefined,
      });
      const fromInput = extractPlanFromInput(enriched);
      if (fromInput) return fromInput;

      const planFilePath =
        typeof enriched.planFilePath === 'string' ? enriched.planFilePath : null;
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

  const messages = ctx.repos.messages.listBySession(session.id);
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message?.role === 'assistant' && message.content.trim()) {
      return message.content.trim();
    }
  }

  throw new Error('No plan content available to build');
}

/**
 * Exit plan mode via Build: stash the current session, create a new auto-mode
 * session, and start implementing the approved plan there.
 */
export async function buildApprovedPlan(
  ctx: AppContext,
  agentId: string,
  body: BuildPlanRequest,
  res: Response,
  sessionId?: string,
): Promise<void> {
  const detail = await getAgentDetail(ctx, agentId);
  if (detail.archivedAt) throw new Error('Cannot build with archived agent');

  const planSession = resolvePermissionSession(ctx, agentId, sessionId, body.requestId);
  const plan = await resolvePlanText(ctx, agentId, planSession, body);

  if (body.requestId) {
    ctx.claude.dismissPermission(planSession.id, body.requestId);
  }

  // Stop the in-flight plan-mode run (avoids ExitPlanMode stdio hang on approve)
  // but keep its messages and Claude session so the user can return to it.
  await stopClaudeRun(ctx, planSession);

  const agent = requireAgent(ctx, agentId);
  const buildSession = createSessionForAgent(ctx, agent, {
    template: 'build',
    permissionMode: 'auto',
    activate: true,
  });

  ctx.repos.events.create(
    makeEvent(agentId, 'plan_build_started', {
      requestId: body.requestId ?? null,
      planLength: plan.length,
      stashedSessionId: planSession.id,
      sessionId: buildSession.id,
    }),
  );

  await streamAgentChat(
    ctx,
    agentId,
    { message: buildImplementPlanPrompt(plan), force: true },
    res,
    buildSession.id,
    { createdSession: buildSession },
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

export async function getAgentDiff(
  ctx: AppContext,
  agentId: string,
  scope: AgentDiffScope = 'pending',
) {
  const detail = await getAgentDetail(ctx, agentId);
  const path = detail.worktree.path;

  if (scope === 'pr') {
    const base = detail.worktree.baseBranch ?? detail.workspace.defaultBranch;
    try {
      const diff = await ctx.git.getDiff(path, `origin/${base}`);
      return { ...diff, path, scope };
    } catch {
      try {
        const diff = await ctx.git.getDiff(path, base);
        return { ...diff, path, scope };
      } catch {
        const diff = await ctx.git.getDiff(path);
        return { ...diff, path, scope };
      }
    }
  }

  const diff = await ctx.git.getDiff(path);
  return { ...diff, path, scope };
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

function extractCostUsd(events: Array<{ total_cost_usd?: number; type?: string }>): number | undefined {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const cost = events[i]?.total_cost_usd;
    if (typeof cost === 'number') return cost;
  }
  return undefined;
}

function finalizeSessionRun(
  ctx: AppContext,
  session: ChatSession,
  result: { result: string; sessionId: string | null; events?: Array<{ total_cost_usd?: number }>; stopped?: boolean },
  assistantText: string,
  extras: MessageMetadata = {},
  options: { assistantMessageId?: string; runLogPath?: string | null } = {},
): Message {
  const latest = ctx.repos.sessions.getById(session.id) ?? session;
  const runLogPath = options.runLogPath ?? session.runLogPath;
  const sameRun =
    (Boolean(runLogPath) && latest.runLogPath === runLogPath) ||
    (session.pid != null && latest.pid === session.pid);

  if (sameRun) {
    ctx.repos.sessions.update(
      clearSessionRunFields(latest, {
        claudeSessionId: result.sessionId ?? latest.claudeSessionId,
        status: 'idle',
      }),
    );
    syncAgentFromSessions(ctx, session.agentId);
  }

  const content =
    (typeof result.result === 'string' && result.result.trim() ? result.result : '') ||
    assistantText.trim() ||
    '';
  const metadata: MessageMetadata = {
    ...extras,
    streaming: false,
    costUsd: extras.costUsd ?? extractCostUsd(result.events ?? []),
    stopped: extras.stopped ?? result.stopped,
  };

  const assistantMessageId = options.assistantMessageId;
  if (assistantMessageId) {
    const existing = ctx.repos.messages.getById(session.agentId, assistantMessageId);
    if (!existing) {
      return {
        id: assistantMessageId,
        agentId: session.agentId,
        sessionId: session.id,
        role: 'assistant',
        content: content || (metadata.stopped ? '[stopped]' : '[no output]'),
        attachments: [],
        metadata,
        createdAt: nowIso(),
      };
    }
    return ctx.repos.messages.update({
      ...existing,
      content: content || (metadata.stopped ? '[stopped]' : existing.content || '[no output]'),
      metadata: {
        ...existing.metadata,
        ...metadata,
        timeline: metadata.timeline ?? existing.metadata.timeline,
        streaming: false,
      },
    });
  }

  const messages = ctx.repos.messages.listBySession(session.id);
  const last = messages[messages.length - 1];

  if (last?.role === 'assistant') {
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
    agentId: session.agentId,
    sessionId: session.id,
    role: 'assistant',
    content: content || (metadata.stopped ? '[stopped]' : '[no output]'),
    attachments: [],
    metadata,
    createdAt: nowIso(),
  };
  ctx.repos.messages.create(assistantMessage);
  return assistantMessage;
}

function markStreamingAssistantStopped(
  ctx: AppContext,
  agentId: string,
  sessionId?: string,
): void {
  const messages = sessionId
    ? ctx.repos.messages.listBySession(sessionId)
    : ctx.repos.messages.listByAgent(agentId);
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
  if (!ctx.repos.messages.getById(message.agentId, message.id)) {
    return message;
  }
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
 * Stop a Claude run and wait until the OS process is gone.
 * Used by Build / Keep planning so a hung ExitPlanMode stdio wait cannot leak.
 */
async function stopClaudeRun(ctx: AppContext, session: ChatSession): Promise<void> {
  ctx.claude.stop(session.id, session.pid, session.runLogPath);
  const pid = session.pid;
  if (pid == null) {
    const afterStop = ctx.repos.sessions.getById(session.id);
    if (afterStop && (afterStop.status === 'running' || afterStop.pid != null)) {
      ctx.repos.sessions.update(clearSessionRunFields(afterStop, { status: 'idle' }));
      syncAgentFromSessions(ctx, session.agentId);
    }
    return;
  }

  const deadline = Date.now() + 5_000;
  while (isPidAlive(pid) && Date.now() < deadline) {
    await sleep(100);
  }
  await sleep(150);
  const afterStop = ctx.repos.sessions.getById(session.id);
  if (afterStop && (afterStop.status === 'running' || afterStop.pid != null)) {
    ctx.repos.sessions.update(clearSessionRunFields(afterStop, { status: 'idle' }));
    syncAgentFromSessions(ctx, session.agentId);
  }
}

/**
 * Re-attach to Claude processes that outlived a previous orchestrator process.
 * Completes message/session persistence when those runs finish.
 */
export function recoverRunningAgents(ctx: AppContext): void {
  const running = ctx.repos.sessions.listRunning();
  for (const session of running) {
    void recoverOneSession(ctx, session);
  }
}

async function recoverOneSession(ctx: AppContext, session: ChatSession): Promise<void> {
  if (session.pid == null || !session.runLogPath) {
    markStreamingAssistantStopped(ctx, session.agentId, session.id);
    ctx.repos.sessions.update(clearSessionRunFields(session, { status: 'idle' }));
    syncAgentFromSessions(ctx, session.agentId);
    return;
  }

  const messages = ctx.repos.messages.listBySession(session.id);
  let assistantMessage = messages[messages.length - 1];
  if (assistantMessage?.role !== 'assistant') {
    assistantMessage = {
      id: uuidv4(),
      agentId: session.agentId,
      sessionId: session.id,
      role: 'assistant',
      content: '',
      attachments: [],
      metadata: { streaming: true, timeline: [] },
      createdAt: nowIso(),
    };
    ctx.repos.messages.create(assistantMessage);
  }

  let assistantText = '';
  let timeline: StreamPart[] = [];
  let lastPersistAt = 0;

  const flushProgress = (forcePersist = false) => {
    const now = Date.now();
    if (!forcePersist && now - lastPersistAt < 300) return;
    lastPersistAt = now;
    if (!assistantMessage) return;
    assistantMessage = persistAssistantProgress(ctx, assistantMessage, assistantText, timeline);
  };

  const onEvent = (
    event: {
      type: string;
      event?: { delta?: { type?: string; text?: string } };
    },
    meta?: { replay?: boolean },
  ) => {
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
      if (!meta?.replay) {
        ctx.repos.events.create(
          makeEvent(session.agentId, event.type, event as Record<string, unknown>),
        );
      }
    }
  };

  const onPermissionRequest = (request: {
    requestId: string;
    toolName: string;
    input: Record<string, unknown>;
    toolUseId?: string;
  }) => {
    const payload = {
      requestId: request.requestId,
      toolName: request.toolName,
      input: request.input,
      toolUseId: request.toolUseId,
      createdAt: nowIso(),
    };
    const already = ctx.repos.events.listByAgent(session.agentId).some(
      (item) =>
        item.type === 'permission_request' &&
        String(item.data.requestId ?? '') === request.requestId,
    );
    if (!already) {
      ctx.repos.events.create(
        makeEvent(session.agentId, 'permission_request', payload as unknown as Record<string, unknown>),
      );
    }
  };

  if (!isPidAlive(session.pid)) {
    try {
      const result = await ctx.claude.attachToRun(
        session.id,
        { pid: session.pid, logPath: session.runLogPath },
        {
          sessionId: session.claudeSessionId,
          permissionMode: session.permissionMode,
          onEvent,
        },
      );
      flushProgress(true);
      finalizeSessionRun(ctx, session, result, assistantText, { timeline }, {
        assistantMessageId: assistantMessage.id,
        runLogPath: session.runLogPath,
      });
    } catch {
      markStreamingAssistantStopped(ctx, session.agentId, session.id);
      ctx.repos.sessions.update(clearSessionRunFields(session, { status: 'idle' }));
      syncAgentFromSessions(ctx, session.agentId);
    }
    return;
  }

  try {
    const result = await ctx.claude.attachToRun(
      session.id,
      { pid: session.pid, logPath: session.runLogPath },
      {
        sessionId: session.claudeSessionId,
        permissionMode: session.permissionMode,
        onEvent,
        onPermissionRequest,
        onCatchUp: () => flushProgress(true),
      },
    );
    flushProgress(true);
    finalizeSessionRun(ctx, session, result, assistantText, { timeline }, {
      assistantMessageId: assistantMessage.id,
      runLogPath: session.runLogPath,
    });
  } catch (error) {
    console.error(`Failed to recover session ${session.id}:`, error);
    markStreamingAssistantStopped(ctx, session.agentId, session.id);
    ctx.repos.sessions.update(clearSessionRunFields(session, { status: 'idle' }));
    syncAgentFromSessions(ctx, session.agentId);
  }
}

export async function streamAgentChat(
  ctx: AppContext,
  agentId: string,
  body: ChatRequest,
  res: Response,
  sessionId?: string,
  options: { createdSession?: ChatSession } = {},
) {
  const detail = await getAgentDetail(ctx, agentId);
  if (detail.archivedAt) {
    throw new Error('Cannot chat with archived agent');
  }

  const session = options.createdSession ?? requireSession(ctx, agentId, sessionId);

  const force = Boolean(body.force);
  const message = body.message.trim();
  if (!message && !(body.images && body.images.length > 0)) {
    throw new Error('Message or image attachment required');
  }

  if (session.status === 'running' && session.pid != null) {
    if (!force) {
      throw new Error('Session already has a running Claude process. Queue the message or force-send.');
    }
    await stopClaudeRun(ctx, session);
    markStreamingAssistantStopped(ctx, agentId, session.id);
  }

  const attachments = await saveChatImages(ctx, agentId, body.images);

  const userMessage: Message = {
    id: uuidv4(),
    agentId,
    sessionId: session.id,
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
    sessionId: session.id,
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

  send('session', session);
  send('user_message', userMessage);
  send('assistant_message', assistantMessage);

  let runningSession: ChatSession = {
    ...(ctx.repos.sessions.getById(session.id) ?? session),
    status: 'running',
    updatedAt: nowIso(),
  };
  ctx.repos.sessions.update(runningSession);
  syncAgentFromSessions(ctx, agentId);

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
    const result = await ctx.claude.runStreaming(runningSession.id, {
      cwd: detail.worktree.path,
      prompt: userMessage.content,
      model: runningSession.model,
      effort: runningSession.effort,
      permissionMode: runningSession.permissionMode,
      sessionId: runningSession.claudeSessionId,
      imagePaths: attachments.map((item) => item.path),
      onStarted: (handle) => {
        runningSession = {
          ...runningSession,
          pid: handle.pid,
          runLogPath: handle.logPath,
          updatedAt: nowIso(),
        };
        ctx.repos.sessions.update(runningSession);
        syncAgentFromSessions(ctx, agentId);
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
          makeEvent(agentId, 'permission_request', {
            ...payload,
            sessionId: runningSession.id,
          } as unknown as Record<string, unknown>),
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
    const finalized = finalizeSessionRun(
      ctx,
      runningSession,
      result,
      assistantText,
      {
        durationMs: Date.now() - startedAt,
        stopped: result.stopped,
        timeline,
      },
      {
        assistantMessageId: assistantMessage.id,
        runLogPath: runningSession.runLogPath,
      },
    );
    send('done', { message: finalized, sessionId: result.sessionId, chatSessionId: runningSession.id });
  } catch (error) {
    const current = ctx.repos.sessions.getById(runningSession.id) ?? runningSession;
    const errMessage = error instanceof Error ? error.message : 'Unknown error';
    flushProgress(true);

    if (assistantText.trim() || timeline.length > 0) {
      const partial = finalizeSessionRun(
        ctx,
        runningSession,
        { result: assistantText, sessionId: runningSession.claudeSessionId, stopped: true },
        assistantText,
        {
          error: errMessage,
          stopped: true,
          durationMs: Date.now() - startedAt,
          timeline,
        },
        {
          assistantMessageId: assistantMessage.id,
          runLogPath: runningSession.runLogPath,
        },
      );
      send('done', {
        message: partial,
        sessionId: current.claudeSessionId,
        chatSessionId: runningSession.id,
      });
    } else {
      if (ctx.repos.messages.getById(agentId, assistantMessage.id)) {
        ctx.repos.messages.deleteFrom(agentId, assistantMessage.id);
      }
      if (
        current.runLogPath === runningSession.runLogPath ||
        (runningSession.pid != null && current.pid === runningSession.pid)
      ) {
        ctx.repos.sessions.update(clearSessionRunFields(current, { status: 'idle' }));
        syncAgentFromSessions(ctx, agentId);
      }
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
  const local = resolveLocalPrContext(ctx, pr.owner, pr.repo, pr.number);

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
    workspaceId: local.workspaceId,
    agentId: local.agentId,
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

/**
 * Local workspace/agent overlay for a GitHub PR, if this app already tracks it.
 * Shared by the inbox and the PR detail page so there is one lookup path.
 */
function resolveLocalPrContext(
  ctx: AppContext,
  owner: string,
  repo: string,
  prNumber: number,
): { workspaceId: string | null; agentId: string | null } {
  const workspace = ctx.repos.workspaces.getByOwnerRepo(owner, repo);
  if (!workspace) {
    return { workspaceId: null, agentId: null };
  }

  const worktree = ctx.repos.worktrees.getByWorkspaceAndPr(workspace.id, prNumber);
  const agentId = worktree ? (ctx.repos.agents.getByWorktreeId(worktree.id)?.id ?? null) : null;
  return { workspaceId: workspace.id, agentId };
}

/** Record a PR lifecycle event on the local agent for this PR, when there is one. */
function recordPullRequestEvent(
  ctx: AppContext,
  owner: string,
  repo: string,
  prNumber: number,
  type: string,
  data: Record<string, unknown>,
): void {
  const { agentId } = resolveLocalPrContext(ctx, owner, repo, prNumber);
  if (!agentId) return;
  ctx.repos.events.create(makeEvent(agentId, type, data));
}

export async function getPullRequestDetail(
  ctx: AppContext,
  owner: string,
  repo: string,
  prNumber: number,
): Promise<PullRequestDetail> {
  const pr = await ctx.github.getPullRequestDetail(owner, repo, prNumber);
  return { ...pr, ...resolveLocalPrContext(ctx, owner, repo, prNumber) };
}

export async function getPullRequestChecks(
  ctx: AppContext,
  owner: string,
  repo: string,
  prNumber: number,
): Promise<PullRequestChecks> {
  // Resolve the head sha server-side so the client cannot ask for an arbitrary commit.
  const pr = await ctx.github.getPullRequestDetail(owner, repo, prNumber);
  return ctx.github.getPullRequestChecks(owner, repo, pr.headSha);
}

export async function getPullRequestReviews(
  ctx: AppContext,
  owner: string,
  repo: string,
  prNumber: number,
) {
  return ctx.github.listPullRequestReviews(owner, repo, prNumber);
}

export async function getPullRequestFiles(
  ctx: AppContext,
  owner: string,
  repo: string,
  prNumber: number,
) {
  return ctx.github.listPullRequestFiles(owner, repo, prNumber);
}

export async function getPullRequestCommits(
  ctx: AppContext,
  owner: string,
  repo: string,
  prNumber: number,
) {
  return ctx.github.listPullRequestCommits(owner, repo, prNumber);
}

export async function getPullRequestComments(
  ctx: AppContext,
  owner: string,
  repo: string,
  prNumber: number,
) {
  return ctx.github.listPullRequestComments(owner, repo, prNumber);
}

export async function mergePullRequest(
  ctx: AppContext,
  owner: string,
  repo: string,
  prNumber: number,
  body: MergePullRequestRequest,
) {
  // Always pin the merge to a head sha so a concurrent push 409s instead of
  // merging commits nobody reviewed.
  const expectedHeadSha =
    body.expectedHeadSha ?? (await ctx.github.getPullRequestDetail(owner, repo, prNumber)).headSha;

  const result = await ctx.github.mergePullRequest(owner, repo, prNumber, { ...body, expectedHeadSha });

  recordPullRequestEvent(ctx, owner, repo, prNumber, 'pr_merged', {
    number: prNumber,
    method: body.method,
    sha: result.sha,
  });

  return result;
}

export async function setPullRequestState(
  ctx: AppContext,
  owner: string,
  repo: string,
  prNumber: number,
  body: SetPullRequestStateRequest,
): Promise<PullRequestDetail> {
  const pr = await ctx.github.setPullRequestState(owner, repo, prNumber, body.state);

  recordPullRequestEvent(
    ctx,
    owner,
    repo,
    prNumber,
    body.state === 'closed' ? 'pr_closed' : 'pr_reopened',
    { number: prNumber },
  );

  return { ...pr, ...resolveLocalPrContext(ctx, owner, repo, prNumber) };
}

export async function updatePullRequestBranch(
  ctx: AppContext,
  owner: string,
  repo: string,
  prNumber: number,
  body: UpdatePullRequestBranchRequest,
) {
  return ctx.github.updatePullRequestBranch(owner, repo, prNumber, body.expectedHeadSha);
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
 * The client should kick off chat with the idea as the first prompt.
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

  const configured: Agent = {
    ...agent,
    model: body.model?.trim() || agent.model,
    effort: body.effort ?? agent.effort,
    permissionMode: body.permissionMode ?? agent.permissionMode,
    updatedAt: nowIso(),
  };
  if (
    configured.model !== agent.model ||
    configured.effort !== agent.effort ||
    configured.permissionMode !== agent.permissionMode
  ) {
    ctx.repos.agents.update(configured);
  }

  return { worktree, agent: configured, branchName, idea };
}

export async function getSystemStatus(ctx: AppContext) {
  const claudeInstalled = await ctx.claude.checkInstalled();
  return {
    claudeInstalled,
    claudeBin: process.env.CLAUDE_BIN ?? 'claude',
    githubTokenConfigured: Boolean(process.env.GITHUB_TOKEN),
    archivedAgentCount: ctx.repos.agents.countArchived(),
  };
}
