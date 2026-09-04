import type {
  Agent,
  AgentEvent,
  ChatSession,
  ChatSessionTemplateId,
  ChatSessionTitleSource,
  EffortLevel,
  Message,
  MessageAttachment,
  MessageMetadata,
  PermissionMode,
  QueuedChatMessage,
  SessionGrade,
  SessionGradeAnalysis,
  SessionGradeScore,
  AgentTask,
  Worktree,
  Workspace,
} from '@agent-orchestrator/shared';
import { DEFAULT_EFFORT_LEVEL } from '@agent-orchestrator/shared';

export function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function rowToWorkspace(row: unknown): Workspace {
  const r = row as Record<string, unknown>;
  return {
    id: String(r.id),
    name: String(r.name),
    repoUrl: String(r.repo_url),
    repoPath: String(r.repo_path),
    defaultBranch: String(r.default_branch),
    githubOwner: String(r.github_owner),
    githubRepo: String(r.github_repo),
    createdAt: String(r.created_at),
  };
}

export function rowToWorktree(row: unknown): Worktree {
  const r = row as Record<string, unknown>;
  return {
    id: String(r.id),
    workspaceId: String(r.workspace_id),
    name: String(r.name),
    path: String(r.path),
    branch: String(r.branch),
    prNumber: r.pr_number == null ? null : Number(r.pr_number),
    prTitle: r.pr_title == null ? null : String(r.pr_title),
    baseBranch: r.base_branch == null ? null : String(r.base_branch),
    createdAt: String(r.created_at),
  };
}

const EFFORT_LEVELS = new Set<EffortLevel>(['low', 'medium', 'high', 'xhigh', 'max']);

export function parseEffort(value: unknown): EffortLevel {
  const raw = typeof value === 'string' ? value : '';
  return EFFORT_LEVELS.has(raw as EffortLevel) ? (raw as EffortLevel) : DEFAULT_EFFORT_LEVEL;
}

export function rowToAgent(row: unknown): Agent {
  const r = row as Record<string, unknown>;
  return {
    id: String(r.id),
    worktreeId: String(r.worktree_id),
    name: String(r.name),
    status: r.status as Agent['status'],
    model: String(r.model),
    effort: parseEffort(r.effort),
    permissionMode: (r.permission_mode as PermissionMode | undefined) ?? 'plan',
    claudeSessionId: r.claude_session_id == null ? null : String(r.claude_session_id),
    pid: r.pid == null ? null : Number(r.pid),
    runLogPath: r.run_log_path == null ? null : String(r.run_log_path),
    activeSessionId: r.active_session_id == null ? null : String(r.active_session_id),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
    archivedAt: r.archived_at == null ? null : String(r.archived_at),
  };
}

const SESSION_TEMPLATES = new Set<ChatSessionTemplateId>([
  'chat',
  'build',
  'create-draft-pr',
  'review',
  'address-review',
  'fix-ci',
  'resolve-conflicts',
]);

function parseSessionTemplate(value: unknown): ChatSessionTemplateId {
  const raw = typeof value === 'string' ? value : '';
  return SESSION_TEMPLATES.has(raw as ChatSessionTemplateId)
    ? (raw as ChatSessionTemplateId)
    : 'chat';
}

function parseTitleSource(value: unknown): ChatSessionTitleSource {
  return value === 'auto' || value === 'user' ? value : 'default';
}

function parseGradeScore(value: unknown): SessionGradeScore | null {
  const score = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(score) || score < 1 || score > 5) return null;
  return score as SessionGradeScore;
}

function parseGradeAnalysis(value: unknown): SessionGradeAnalysis | null {
  if (value == null || value === '') return null;
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const row = parsed as Record<string, unknown>;
    if (typeof row.summary !== 'string' || !Array.isArray(row.findings) || !row.stats) return null;
    const sessionFilePath =
      typeof row.sessionFilePath === 'string' && row.sessionFilePath.trim()
        ? row.sessionFilePath
        : null;
    return { ...(parsed as SessionGradeAnalysis), sessionFilePath };
  } catch {
    return null;
  }
}

function rowToGrade(row: Record<string, unknown>): SessionGrade | null {
  const score = parseGradeScore(row.grade_score);
  if (score == null || row.graded_at == null) return null;
  return {
    score,
    comment: row.grade_comment == null ? '' : String(row.grade_comment),
    gradedAt: String(row.graded_at),
    analysis: parseGradeAnalysis(row.grade_analysis),
  };
}

export function rowToChatSession(row: unknown): ChatSession {
  const r = row as Record<string, unknown>;
  return {
    id: String(r.id),
    agentId: String(r.agent_id),
    title: String(r.title),
    template: parseSessionTemplate(r.template),
    status: r.status as ChatSession['status'],
    model: String(r.model),
    effort: parseEffort(r.effort),
    permissionMode: (r.permission_mode as PermissionMode | undefined) ?? 'plan',
    agentTaskId: r.agent_task_id == null || r.agent_task_id === '' ? null : String(r.agent_task_id),
    systemPrompt:
      r.system_prompt == null || r.system_prompt === '' ? null : String(r.system_prompt),
    allowedTools:
      r.allowed_tools == null || r.allowed_tools === '' ? null : String(r.allowed_tools),
    claudeSessionId: r.claude_session_id == null ? null : String(r.claude_session_id),
    pid: r.pid == null ? null : Number(r.pid),
    runLogPath: r.run_log_path == null ? null : String(r.run_log_path),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
    grade: rowToGrade(r),
    titleSource: parseTitleSource(r.title_source),
  };
}

export function rowToAgentTask(row: unknown): AgentTask {
  const r = row as Record<string, unknown>;
  return {
    id: String(r.id),
    name: String(r.name),
    title: String(r.title),
    description: r.description == null ? '' : String(r.description),
    purpose: r.purpose == null ? '' : String(r.purpose),
    promptTemplate:
      r.prompt_template == null || r.prompt_template === '' ? null : String(r.prompt_template),
    systemPrompt:
      r.system_prompt == null || r.system_prompt === '' ? null : String(r.system_prompt),
    allowedTools:
      r.allowed_tools == null || r.allowed_tools === '' ? null : String(r.allowed_tools),
    model: String(r.model ?? 'sonnet'),
    effort: parseEffort(r.effort),
    permissionMode: (r.permission_mode as PermissionMode | undefined) ?? 'plan',
    listed: Number(r.listed) === 1,
    builtIn: Number(r.built_in) === 1,
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

function attachmentUrl(agentId: string, attachmentId: string): string {
  return `/api/agents/${agentId}/attachments/${attachmentId}`;
}

export function rowToMessage(row: unknown): Message {
  const r = row as Record<string, unknown>;
  const agentId = String(r.agent_id);
  const attachments = parseJson<MessageAttachment[]>(String(r.attachments ?? '[]'), []).map(
    (item) => ({
      ...item,
      url: item.url || attachmentUrl(agentId, item.id),
    }),
  );
  return {
    id: String(r.id),
    agentId,
    sessionId: r.session_id == null ? '' : String(r.session_id),
    role: r.role as Message['role'],
    content: String(r.content),
    attachments,
    metadata: parseJson<MessageMetadata>(String(r.metadata ?? '{}'), {}),
    createdAt: String(r.created_at),
  };
}

export function rowToQueuedMessage(row: unknown): QueuedChatMessage {
  const r = row as Record<string, unknown>;
  const agentId = String(r.agent_id);
  const attachments = parseJson<MessageAttachment[]>(String(r.attachments ?? '[]'), []).map(
    (item) => ({
      ...item,
      url: item.url || attachmentUrl(agentId, item.id),
    }),
  );
  return {
    id: String(r.id),
    agentId,
    sessionId: String(r.session_id),
    content: String(r.content),
    attachments,
    mentions: parseJson<QueuedChatMessage['mentions']>(String(r.mentions ?? '[]'), []),
    blockedReason:
      r.blocked_reason == null || r.blocked_reason === ''
        ? null
        : (String(r.blocked_reason) as QueuedChatMessage['blockedReason']),
    createdAt: String(r.created_at),
  };
}

export function rowToEvent(row: unknown): AgentEvent {
  const r = row as Record<string, unknown>;
  return {
    id: String(r.id),
    agentId: String(r.agent_id),
    type: String(r.type),
    data: {},
    createdAt: String(r.created_at),
  };
}
