import { Box, Button } from '@mui/material';
import GppMaybeOutlinedIcon from '@mui/icons-material/GppMaybeOutlined';
import type { PermissionRequest } from '@agent-orchestrator/shared';
import { ChatPromptCard } from './ChatPromptCard';
import { toolActionLabel } from './toolPresentation';

interface ToolPermissionCardProps {
  request: PermissionRequest;
  submitting?: boolean;
  onAllow: () => void;
  onDeny: () => void;
}

function summarizeInput(input: Record<string, unknown>): string {
  try {
    const json = JSON.stringify(input, null, 2);
    if (!json || json === '{}') return 'No input details';
    return json.length > 1200 ? `${json.slice(0, 1200)}\n…` : json;
  } catch {
    return 'Unable to display tool input';
  }
}

export function ToolPermissionCard({
  request,
  submitting,
  onAllow,
  onDeny,
}: ToolPermissionCardProps) {
  return (
    <ChatPromptCard
      accent="warning"
      icon={<GppMaybeOutlinedIcon />}
      title={`Allow ${request.toolName}?`}
      description={`${toolActionLabel(request.toolName)} needs your approval. Review the details, then allow or deny.`}
      actions={
        <>
          <Button variant="contained" color="warning" disabled={submitting} onClick={onAllow}>
            Allow
          </Button>
          <Button variant="outlined" disabled={submitting} onClick={onDeny}>
            Deny
          </Button>
        </>
      }
    >
      <Box
        component="pre"
        sx={{
          maxHeight: 240,
          overflow: 'auto',
          m: 0,
          p: 1.5,
          borderRadius: 1.5,
          bgcolor: 'rgba(11,15,23,0.55)',
          border: 1,
          borderColor: 'divider',
          fontFamily: '"IBM Plex Mono", monospace',
          fontSize: 12,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {summarizeInput(request.input)}
      </Box>
    </ChatPromptCard>
  );
}
