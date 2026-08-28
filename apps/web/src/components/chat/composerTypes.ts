import type { EffortLevel, PermissionMode, SessionGrade } from '@agent-orchestrator/shared';
import type { PendingMention } from './mentionComposer';

export interface PendingImage {
  id: string;
  name: string;
  mimeType: string;
  previewUrl: string;
  dataBase64: string;
}

export interface QueuedChatItem {
  id: string;
  text: string;
  images: PendingImage[];
  mentions: PendingMention[];
}

export interface ChatComposerProps {
  agentId: string;
  sessionId: string;
  archived: boolean;
  isStreaming: boolean;
  model: string;
  effort: EffortLevel;
  permissionMode: PermissionMode;
  queue: QueuedChatItem[];
  onModelChange: (model: string) => void;
  onEffortChange: (effort: EffortLevel) => void;
  onPermissionModeChange: (mode: PermissionMode) => void;
  onSend: (text: string, images: PendingImage[], mentions: PendingMention[], force: boolean) => void;
  onStop: () => void;
  onClear: () => void;
  onRewind: () => void;
  onRemoveQueued: (id: string) => void;
  draft: string;
  onDraftChange: (value: string) => void;
  grade?: SessionGrade | null;
  canGrade?: boolean;
  onGrade?: () => void;
}
