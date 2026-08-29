import { useCallback } from 'react';
import type { SyntheticEvent } from 'react';
import { Button, Snackbar, Stack, Typography } from '@mui/material';
import NotificationsActiveIcon from '@mui/icons-material/NotificationsActive';
import {
  dismissAttentionAlert,
  useAttentionAlerts,
  type AttentionAlert,
} from '../notifications/attention';

interface AttentionSnackbarProps {
  onOpenAgent: (alert: AttentionAlert) => void;
}

export function AttentionSnackbar({ onOpenAgent }: AttentionSnackbarProps) {
  const alertsList = useAttentionAlerts();
  const current = alertsList[0] ?? null;
  const queueCount = alertsList.length;

  const handleClose = useCallback(
    (_event?: Event | SyntheticEvent, reason?: string) => {
      if (reason === 'clickaway') return;
      if (current) dismissAttentionAlert(current.id);
    },
    [current],
  );

  const handleOpen = useCallback(() => {
    if (!current) return;
    onOpenAgent(current);
    dismissAttentionAlert(current.id);
  }, [current, onOpenAgent]);

  return (
    <Snackbar
      open={Boolean(current)}
      autoHideDuration={queueCount > 1 ? 8000 : 12000}
      onClose={handleClose}
      anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
      sx={{
        top: { xs: 'calc(16px + env(safe-area-inset-top, 0px))', sm: 24 },
        maxWidth: 'min(560px, calc(100vw - 24px))',
      }}
      message={
        current ? (
          <Stack direction="row" spacing={1.25} sx={{ alignItems: 'flex-start', minWidth: 0 }}>
            <NotificationsActiveIcon color="warning" sx={{ mt: 0.25, flexShrink: 0 }} />
            <Stack spacing={0.25} sx={{ minWidth: 0 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, lineHeight: 1.3 }}>
                {current.title}
                {queueCount > 1 ? ` (+${queueCount - 1} more)` : ''}
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.4 }}>
                {current.body}
              </Typography>
            </Stack>
          </Stack>
        ) : null
      }
      action={
        current ? (
          <Button color="secondary" size="small" onClick={handleOpen} sx={{ flexShrink: 0, mt: 0.25 }}>
            View
          </Button>
        ) : undefined
      }
    />
  );
}
