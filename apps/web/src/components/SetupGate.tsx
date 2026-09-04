import { useEffect, useState, type FormEvent } from 'react';
import {
  Alert,
  Box,
  Button,
  Link,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { ControlTooltip } from './ui/ControlTooltip';

export function SetupGate({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const statusQuery = useQuery({
    queryKey: ['status'],
    queryFn: api.getStatus,
  });
  const needsSetupDetails = Boolean(
    statusQuery.data &&
      (!statusQuery.data.githubTokenConfigured ||
        !statusQuery.data.claudeInstalled ||
        !statusQuery.data.anthropicConfigured),
  );
  const setupQuery = useQuery({
    queryKey: ['setup'],
    queryFn: api.getSetupInfo,
    enabled: needsSetupDetails,
  });

  const [githubToken, setGithubToken] = useState('');
  const [claudeBin, setClaudeBin] = useState('');

  useEffect(() => {
    const candidate = setupQuery.data?.claudeCandidates[0] ?? statusQuery.data?.claudeBin;
    if (candidate && !claudeBin) setClaudeBin(candidate);
  }, [setupQuery.data?.claudeCandidates, statusQuery.data?.claudeBin, claudeBin]);

  const githubMutation = useMutation({
    mutationFn: () => api.configureGithubToken(githubToken.trim()),
    onSuccess: () => {
      setGithubToken('');
      void queryClient.invalidateQueries({ queryKey: ['status'] });
      void queryClient.invalidateQueries({ queryKey: ['setup'] });
    },
  });

  const claudeMutation = useMutation({
    mutationFn: () => api.configureClaudeBin(claudeBin.trim()),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['status'] });
      void queryClient.invalidateQueries({ queryKey: ['setup'] });
    },
  });

  const claudeAuthMutation = useMutation({
    mutationFn: () => api.verifyClaudeAuth(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['status'] });
      void queryClient.invalidateQueries({ queryKey: ['setup'] });
    },
  });

  if (statusQuery.isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}>
        <Typography color="text.secondary">Loading…</Typography>
      </Box>
    );
  }

  const status = statusQuery.data;
  const setup = setupQuery.data;
  const ready = Boolean(
    status?.claudeInstalled && status?.githubTokenConfigured && status?.anthropicConfigured,
  );
  if (ready) return children;

  const setupDocsUrl = status?.setupDocsUrl ?? setup?.setupDocsUrl ?? '#';
  const claudeDocsUrl = status?.claudeDocsUrl ?? setup?.claudeDocsUrl ?? 'https://code.claude.com';
  const candidates = setup?.claudeCandidates ?? (status?.claudeBin ? [status.claudeBin] : ['claude']);

  const onGithubSubmit = (event: FormEvent) => {
    event.preventDefault();
    githubMutation.mutate();
  };

  const onClaudeSubmit = (event: FormEvent) => {
    event.preventDefault();
    claudeMutation.mutate();
  };

  return (
    <Box sx={{ maxWidth: 520, mx: 'auto', px: 2, py: { xs: 4, md: 6 } }}>
      <Stack spacing={3}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700, mb: 1 }}>
            Welcome to Agent Orchestrator
          </Typography>
          <Typography color="text.secondary" sx={{ lineHeight: 1.6 }}>
            Connect GitHub and Claude Code (OAuth) to manage workspaces and agents. See the{' '}
            <Link href={setupDocsUrl} target="_blank" rel="noopener noreferrer">
              setup guide
            </Link>{' '}
            for details.
          </Typography>
        </Box>

        {!status?.githubTokenConfigured ? (
          <Box
            component="form"
            onSubmit={onGithubSubmit}
            sx={{
              border: 1,
              borderColor: 'divider',
              borderRadius: 2,
              p: 2.5,
              bgcolor: 'ao.surface.panel',
            }}
          >
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 0.5 }}>
              GitHub token
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Paste a personal access token with <code>repo</code> scope. It is stored locally under
              your data directory and never logged.
            </Typography>
            <ControlTooltip title="GitHub personal access token (repo scope)">
              <TextField
                label="GitHub token"
                type="password"
                value={githubToken}
                onChange={(e) => setGithubToken(e.target.value)}
                fullWidth
                autoFocus
                sx={{ mb: 2 }}
              />
            </ControlTooltip>
            {githubMutation.error ? (
              <Alert severity="error" sx={{ mb: 2 }}>
                {(githubMutation.error as Error).message}
              </Alert>
            ) : null}
            <ControlTooltip
              title="Validate and save the token"
              disabled={!githubToken.trim() || githubMutation.isPending}
            >
              <Button
                type="submit"
                variant="contained"
                disabled={!githubToken.trim() || githubMutation.isPending}
              >
                {githubMutation.isPending ? 'Connecting…' : 'Connect GitHub'}
              </Button>
            </ControlTooltip>
          </Box>
        ) : null}

        {!status?.claudeInstalled ? (
          <Box
            component="form"
            onSubmit={onClaudeSubmit}
            sx={{
              border: 1,
              borderColor: 'divider',
              borderRadius: 2,
              p: 2.5,
              bgcolor: 'ao.surface.panel',
            }}
          >
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 0.5 }}>
              Claude Code CLI
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Install{' '}
              <Link href={claudeDocsUrl} target="_blank" rel="noopener noreferrer">
                Claude Code
                <OpenInNewIcon sx={{ fontSize: 14, ml: 0.25, verticalAlign: 'text-bottom' }} />
              </Link>
              , then confirm the binary path below.
            </Typography>
            <ControlTooltip title="Path to the claude executable">
              <TextField
                select={candidates.length > 1}
                label="Claude binary"
                value={claudeBin || candidates[0] || 'claude'}
                onChange={(e) => setClaudeBin(e.target.value)}
                fullWidth
                sx={{ mb: 2 }}
              >
                {candidates.map((candidate) => (
                  <MenuItem key={candidate} value={candidate}>
                    {candidate}
                  </MenuItem>
                ))}
              </TextField>
            </ControlTooltip>
            {claudeMutation.error ? (
              <Alert severity="error" sx={{ mb: 2 }}>
                {(claudeMutation.error as Error).message}
              </Alert>
            ) : null}
            <ControlTooltip
              title="Verify Claude Code is installed at this path"
              disabled={claudeMutation.isPending}
            >
              <Button type="submit" variant="contained" disabled={claudeMutation.isPending}>
                {claudeMutation.isPending ? 'Checking…' : 'Verify Claude'}
              </Button>
            </ControlTooltip>
          </Box>
        ) : null}

        {status?.claudeInstalled && !status?.anthropicConfigured ? (
          <Box
            sx={{
              border: 1,
              borderColor: 'divider',
              borderRadius: 2,
              p: 2.5,
              bgcolor: 'ao.surface.panel',
            }}
          >
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 0.5 }}>
              Claude authentication
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
              Agents and helpers use the Claude Agent SDK with your Claude Code login. In a
              terminal run <code>claude login</code>, then verify below.
            </Typography>
            {claudeAuthMutation.error ? (
              <Alert severity="error" sx={{ mb: 2 }}>
                {(claudeAuthMutation.error as Error).message}
              </Alert>
            ) : null}
            <ControlTooltip
              title="Check that Claude Code is logged in"
              disabled={claudeAuthMutation.isPending}
            >
              <Button
                variant="contained"
                disabled={claudeAuthMutation.isPending}
                onClick={() => claudeAuthMutation.mutate()}
              >
                {claudeAuthMutation.isPending ? 'Checking…' : 'Verify Claude login'}
              </Button>
            </ControlTooltip>
          </Box>
        ) : null}
      </Stack>
    </Box>
  );
}
