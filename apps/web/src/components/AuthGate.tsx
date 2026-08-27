import { useState, type FormEvent } from 'react';
import { Alert, Box, Button, CircularProgress, Stack, TextField, Typography } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { api, setAuthToken } from '../api/client';

export function AuthGate({ children }: { children: React.ReactNode }) {
  const statusQuery = useQuery({
    queryKey: ['status'],
    queryFn: api.getStatus,
    retry: false,
  });
  const [token, setToken] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const authRequired =
    Boolean((statusQuery.error as { authRequired?: boolean } | null)?.authRequired) ||
    statusQuery.error?.message === 'Unauthorized';

  if (statusQuery.isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (authRequired) {
    const onSubmit = async (event: FormEvent) => {
      event.preventDefault();
      setSubmitting(true);
      setError(null);
      try {
        setAuthToken(token.trim());
        await api.submitAuth(token.trim());
        await statusQuery.refetch();
      } catch (err) {
        setAuthToken('');
        setError((err as Error).message || 'Invalid token');
      } finally {
        setSubmitting(false);
      }
    };

    return (
      <Box sx={{ maxWidth: 420, mx: 'auto', px: 2, py: 8 }}>
        <Stack component="form" spacing={2} onSubmit={(event) => void onSubmit(event)}>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            Unlock orchestrator
          </Typography>
          <Typography color="text.secondary">
            This instance requires the shared <code>AUTH_TOKEN</code>. Paste it to continue.
          </Typography>
          <TextField
            label="Auth token"
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            autoFocus
            fullWidth
          />
          {error ? <Alert severity="error">{error}</Alert> : null}
          <Button type="submit" variant="contained" disabled={!token.trim() || submitting}>
            {submitting ? 'Checking…' : 'Continue'}
          </Button>
        </Stack>
      </Box>
    );
  }

  if (statusQuery.error && !authRequired) {
    return (
      <Box sx={{ maxWidth: 520, mx: 'auto', px: 2, py: 8 }}>
        <Alert severity="error">{(statusQuery.error as Error).message}</Alert>
      </Box>
    );
  }

  return children;
}
