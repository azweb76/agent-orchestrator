export type ChatRole = 'user' | 'assistant' | 'system';

export type ChatStatus = 'idle' | 'streaming' | 'awaiting_input' | 'error';

export type PermissionMode =
  | 'default'
  | 'acceptEdits'
  | 'plan'
  | 'auto'
  | 'dontAsk'
  | 'bypassPermissions';

export type EffortLevel = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface ChatAttachment {
  id: string;
  name: string;
  mimeType?: string;
  url?: string;
  previewUrl?: string;
}

export interface ChatTodoItem {
  content: string;
  status: string;
  activeForm?: string;
}

export interface ChatSubagentInfo {
  taskId?: string;
  taskType?: string;
  subagentType?: string;
  description?: string;
  lastToolName?: string;
  backgrounded?: boolean;
  summary?: string;
  durationMs?: number;
  toolUses?: number;
  totalTokens?: number;
  outcome?: 'completed' | 'failed';
}

export type ChatBlock =
  | { type: 'text'; id: string; text: string }
  | { type: 'thinking'; id: string; text: string; redacted?: boolean }
  | {
      type: 'tool_use';
      id: string;
      name: string;
      detail?: string;
      status: 'running' | 'done' | 'error';
      input?: Record<string, unknown>;
      result?: string;
      task?: ChatSubagentInfo;
    }
  | { type: 'tool_result'; id: string; toolUseId: string; content: string; isError?: boolean }
  | { type: 'diff'; id: string; path?: string; diff: string }
  | { type: 'todo_list'; id: string; items: ChatTodoItem[] }
  | { type: 'image'; id: string; mimeType?: string; url?: string; alt?: string; data?: string }
  | {
      type: 'result';
      id: string;
      costUsd?: number;
      durationMs?: number;
      error?: string;
      stopped?: boolean;
    };

export interface ChatTurn {
  id: string;
  role: ChatRole;
  createdAt: string;
  content?: string;
  attachments?: ChatAttachment[];
  blocks?: ChatBlock[];
  streaming?: boolean;
  error?: string;
  stopped?: boolean;
  costUsd?: number;
  durationMs?: number;
}

export interface AskUserQuestionOption {
  label: string;
  description?: string;
  preview?: string;
}

export interface AskUserQuestionItem {
  question: string;
  header?: string;
  options: AskUserQuestionOption[];
  multiSelect?: boolean;
}

export interface PermissionPrompt {
  id: string;
  toolName: string;
  input: Record<string, unknown>;
  toolUseId?: string;
  createdAt?: string;
}

export interface ContextUsage {
  percent?: number;
  usedTokens?: number;
  contextWindow?: number;
  compactThreshold?: number;
}

export interface ComposerAttachment {
  id: string;
  name: string;
  mimeType: string;
  previewUrl: string;
  dataBase64?: string;
}

export interface QueuedComposerItem {
  id: string;
  text: string;
  attachments: ComposerAttachment[];
  extraLabel?: string;
}

export interface SlashCommandItem {
  id: string;
  command: string;
  description?: string;
  aliases?: string[];
  insert?: string;
  prompt?: string;
  kind?: 'prompt' | 'local' | 'context' | 'skill' | string;
}

export interface AutocompleteOption {
  id: string;
  label: string;
  description?: string;
  insert?: string;
}

export interface ComposerAutocompletePlugin {
  id: string;
  trigger: string;
  options: AutocompleteOption[];
  onSelect: (option: AutocompleteOption, draft: string) => string;
}

export interface SelectOption {
  id: string;
  label: string;
}

export interface ComposerSendPayload {
  text: string;
  attachments: ComposerAttachment[];
  extra?: unknown;
  force: boolean;
}

export interface ClaudeComposerConfig {
  draft: string;
  onDraftChange: (value: string) => void;
  onSend: (payload: ComposerSendPayload) => void;
  onStop: () => void;
  onInterrupt?: () => void;
  permissionMode?: PermissionMode;
  onPermissionModeChange?: (mode: PermissionMode) => void;
  permissionModes?: SelectOption[];
  model?: string;
  models?: SelectOption[];
  onModelChange?: (model: string) => void;
  effort?: EffortLevel;
  efforts?: SelectOption[];
  onEffortChange?: (effort: EffortLevel) => void;
  attachments?: ComposerAttachment[];
  onAttachmentsChange?: (items: ComposerAttachment[]) => void;
  slashCommands?: SlashCommandItem[];
  plugins?: ComposerAutocompletePlugin[];
  queue?: QueuedComposerItem[];
  onRemoveQueued?: (id: string) => void;
  disabled?: boolean;
  placeholder?: string;
  onClear?: () => void;
  onRewind?: () => void;
}

export interface ClaudeChatSlots {
  header?: React.ReactNode;
  banners?: React.ReactNode;
  emptyState?: React.ReactNode;
  footer?: React.ReactNode;
  composer?: React.ReactNode;
  composerLeading?: React.ReactNode;
  composerTrailing?: React.ReactNode;
}

export interface ClaudeChatProps {
  messages: ChatTurn[];
  pendingPermissions?: PermissionPrompt[];
  status?: ChatStatus;
  contextUsage?: ContextUsage | null;
  onCompact?: () => void;
  compacting?: boolean;
  composer?: ClaudeComposerConfig;
  slots?: ClaudeChatSlots;
  renderPermission?: (
    prompt: PermissionPrompt,
    defaultEl: React.ReactNode,
  ) => React.ReactNode;
  renderBlock?: (block: ChatBlock, turn: ChatTurn) => React.ReactNode | undefined;
  renderTurn?: (turn: ChatTurn, index: number, defaultEl: React.ReactNode) => React.ReactNode;
  loading?: boolean;
  error?: string | null;
  onRewindMessage?: (turn: ChatTurn) => void;
  onRetry?: (turn: ChatTurn) => void;
  highlightPermissions?: boolean;
  permissionBusy?: boolean;
  onAllowPermission?: (prompt: PermissionPrompt) => void;
  onDenyPermission?: (prompt: PermissionPrompt) => void;
  onAnswerQuestions?: (
    prompt: PermissionPrompt,
    answers: Record<string, string>,
    response?: string,
  ) => void;
  onSkipQuestions?: (prompt: PermissionPrompt) => void;
  onApprovePlan?: (prompt: PermissionPrompt) => void;
  onKeepPlanning?: (prompt: PermissionPrompt) => void;
  onDenyPlan?: (prompt: PermissionPrompt) => void;
}
