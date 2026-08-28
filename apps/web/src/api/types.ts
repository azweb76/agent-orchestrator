import type { ChatSession, Message, PermissionRequest } from '@agent-orchestrator/shared';

export interface SystemStatus {
  claudeInstalled: boolean;
  claudeBin: string;
  githubTokenConfigured: boolean;
  githubLogin: string | null;
  authRequired: boolean;
  archivedAgentCount: number;
  dataDirBytes: number;
  setupDocsUrl?: string;
  claudeDocsUrl?: string;
}

export interface SetupInfo {
  claudeCandidates: string[];
  claudeBin: string;
  claudeInstalled: boolean;
  githubTokenConfigured: boolean;
  setupDocsUrl: string;
  claudeDocsUrl: string;
}

export interface ChatStreamHandlers {
  onToken: (text: string) => void;
  onEvent: (event: Record<string, unknown>) => void;
  onPermissionRequest?: (request: PermissionRequest) => void;
  onUserMessage?: (message: Message) => void;
  onAssistantMessage?: (message: Message) => void;
  onSession?: (session: ChatSession) => void;
  onDone: (payload: { message: Message; sessionId: string | null; chatSessionId?: string }) => void;
  onError: (message: string) => void;
}

export interface StreamChatOptions {
  message: string;
  force?: boolean;
  images?: Array<{ name: string; mimeType: string; dataBase64: string }>;
  mentions?: Array<{ kind: 'file' | 'diff'; path?: string }>;
}
