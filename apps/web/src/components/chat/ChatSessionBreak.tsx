import { Box, Chip, Divider, Stack, Typography } from '@mui/material';
import {
  CLAUDE_EFFORT_LEVELS,
  CLAUDE_MODELS,
  PERMISSION_MODES,
  chatSessionTemplateById,
  type ChatSession,
} from '@agent-orchestrator/shared';

function modelLabel(model: string): string {
  const found = CLAUDE_MODELS.find((item) => item.id === model);
  return found ? found.label.replace('Claude ', '') : model;
}

function effortLabel(effort: ChatSession['effort']): string {
  return CLAUDE_EFFORT_LEVELS.find((item) => item.id === effort)?.label ?? effort;
}

function permissionLabel(mode: ChatSession['permissionMode']): string {
  return PERMISSION_MODES.find((item) => item.id === mode)?.label ?? mode;
}

export function ChatSessionBreak({
  session,
  active,
}: {
  session: ChatSession;
  active: boolean;
}) {
  const templateTitle = chatSessionTemplateById(session.template)?.title ?? session.template;
  const running = session.status === 'running';
  const waiting = session.status === 'queued';

  return (
    <Box
      data-session-break={session.id}
      sx={{
        pt: 1.25,
        pb: 1.5,
        px: 1,
        mb: 1.25,
        borderRadius: 1,
        borderLeft: 3,
        borderColor: active ? 'primary.main' : 'transparent',
        bgcolor: active ? 'action.selected' : 'transparent',
      }}
    >
      <Stack
        direction="row"
        spacing={1}
        useFlexGap
        sx={{ alignItems: 'center', flexWrap: 'wrap', rowGap: 0.5 }}
      >
        <Typography variant="subtitle2" sx={{ fontWeight: 700, minWidth: 0 }}>
          {session.title}
        </Typography>
        <Chip size="small" variant="outlined" label={templateTitle} />
        {running ? <Chip size="small" color="secondary" label="Running" /> : null}
        {waiting ? <Chip size="small" label="Waiting" /> : null}
        {session.grade?.score != null ? (
          <Chip size="small" label={`${session.grade.score}★`} />
        ) : null}
      </Stack>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: 'block', mt: 0.5, fontWeight: 600 }}
      >
        {modelLabel(session.model)} · {effortLabel(session.effort)} · {permissionLabel(session.permissionMode)}
      </Typography>
      <Divider sx={{ mt: 1.25 }} />
    </Box>
  );
}
