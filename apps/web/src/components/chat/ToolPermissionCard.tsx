import type { PermissionRequest } from '@agent-orchestrator/shared';
import { ToolPermissionCard as KitToolPermissionCard } from '../claude-chat/permissions/ToolPermissionCard';
import { mapPermissionPrompt } from './mapAgentChatToClaudeChat';

export function ToolPermissionCard({
  request,
  submitting,
  onAllow,
  onDeny,
}: {
  request: PermissionRequest;
  submitting?: boolean;
  onAllow: () => void;
  onDeny: () => void;
}) {
  return (
    <KitToolPermissionCard
      request={mapPermissionPrompt(request)}
      submitting={submitting}
      onAllow={onAllow}
      onDeny={onDeny}
    />
  );
}
