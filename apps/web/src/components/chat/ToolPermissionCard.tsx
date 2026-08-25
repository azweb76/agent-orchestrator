import { Box, Button, Stack, Typography } from '@mui/material';
import type { PermissionRequest } from '@agent-orchestrator/shared';

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
    <Box
      sx={{
        mb: 1.5,
        p: 2,
        border: 1,
        borderColor: 'warning.main',
        borderRadius: 2,
        bgcolor: 'action.hover',
      }}
    >
      <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.5 }}>
        Allow {request.toolName}?
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        Claude wants to use this tool. Review the details, then allow or deny.
      </Typography>

      <Box
        component="pre"
        sx={{
          maxHeight: 240,
          overflow: 'auto',
          mb: 2,
          p: 1.5,
          m: 0,
          borderRadius: 1,
          bgcolor: 'background.paper',
          border: 1,
          borderColor: 'divider',
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          fontSize: 12,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {summarizeInput(request.input)}
      </Box>

      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
        Request {request.requestId.slice(0, 8)}…
      </Typography>

      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
        <Button variant="contained" color="warning" disabled={submitting} onClick={onAllow}>
          Allow
        </Button>
        <Button variant="outlined" disabled={submitting} onClick={onDeny}>
          Deny
        </Button>
      </Stack>
    </Box>
  );
}
