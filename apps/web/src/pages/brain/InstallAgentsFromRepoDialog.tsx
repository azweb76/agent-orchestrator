import { useEffect, useState } from 'react';
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Checkbox,
  Chip,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import type { PreviewRepoAgentsResponse, RepoAgentCandidate } from '@agent-orchestrator/shared';
import { api } from '../../api/client';
import { ControlTooltip } from '../../components/ui/ControlTooltip';
import { ResponsiveDialog } from '../../components/ui/ResponsiveDialog';

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

export function InstallAgentsFromRepoDialog({
  open,
  embedded = false,
  onClose,
  onInstalled,
}: {
  open: boolean;
  embedded?: boolean;
  onClose: () => void;
  onInstalled: () => void;
}) {
  const [repoSearch, setRepoSearch] = useState('');
  const [workspaceId, setWorkspaceId] = useState('');
  const [preview, setPreview] = useState<PreviewRepoAgentsResponse | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [overwrite, setOverwrite] = useState(false);
  const debouncedSearch = useDebouncedValue(repoSearch, 300);

  const { data: status } = useQuery({
    queryKey: ['status'],
    queryFn: api.getStatus,
    enabled: open,
  });
  const workspacesQuery = useQuery({
    queryKey: ['workspaces'],
    queryFn: api.listWorkspaces,
    enabled: open,
  });
  const reposQuery = useQuery({
    queryKey: ['github-repos', debouncedSearch],
    queryFn: () => api.searchRepositories(debouncedSearch),
    enabled: open && Boolean(status?.githubTokenConfigured) && !workspaceId,
    staleTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData,
  });

  useEffect(() => {
    if (!open) {
      setRepoSearch('');
      setWorkspaceId('');
      setPreview(null);
      setSelected([]);
      setOverwrite(false);
    }
  }, [open]);

  const source = (): { repo?: string; workspaceId?: string } => {
    if (workspaceId) return { workspaceId };
    const repo = repoSearch.trim();
    if (!repo) throw new Error('Choose a GitHub repository or a workspace');
    return { repo };
  };

  const previewMutation = useMutation({
    mutationFn: () => api.previewRepoAgents(source()),
    onSuccess: (data) => {
      setPreview(data);
      setSelected(data.agents.filter((agent) => !agent.alreadyInstalled).map((agent) => agent.slug));
    },
  });

  const installMutation = useMutation({
    mutationFn: () =>
      api.installRepoAgents({
        ...source(),
        slugs: selected,
        overwrite,
      }),
    onSuccess: () => {
      onInstalled();
      onClose();
    },
  });

  const toggle = (slug: string) => {
    setSelected((current) =>
      current.includes(slug) ? current.filter((item) => item !== slug) : [...current, slug],
    );
  };

  const error =
    previewMutation.error instanceof Error
      ? previewMutation.error.message
      : installMutation.error instanceof Error
        ? installMutation.error.message
        : null;

  const inner = (
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          {error ? <Alert severity="error">{error}</Alert> : null}
          <Typography color="text.secondary">
            Scan a GitHub repository or a cloned workspace for <code>.claude/agents/*.md</code> (or{' '}
            <code>agents/*.md</code>) and copy them into your personal library.
          </Typography>
          <FormControl fullWidth>
            <InputLabel id="install-agents-workspace">Workspace (optional)</InputLabel>
            <Select
              labelId="install-agents-workspace"
              label="Workspace (optional)"
              value={workspaceId}
              onChange={(event) => {
                setWorkspaceId(event.target.value);
                setPreview(null);
              }}
            >
              <MenuItem value="">None — use GitHub</MenuItem>
              {(workspacesQuery.data ?? []).map((workspace) => (
                <MenuItem key={workspace.id} value={workspace.id}>
                  {workspace.name} ({workspace.githubOwner}/{workspace.githubRepo})
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          {!workspaceId ? (
            <Autocomplete
              freeSolo
              options={reposQuery.data ?? []}
              loading={reposQuery.isFetching}
              inputValue={repoSearch}
              onInputChange={(_, value) => {
                setRepoSearch(value);
                setPreview(null);
              }}
              getOptionLabel={(option) => (typeof option === 'string' ? option : option.fullName)}
              filterOptions={(options) => options}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="GitHub repository"
                  placeholder="owner/repo or https://github.com/owner/repo"
                  helperText="Searches your accessible repos when a GitHub token is configured."
                />
              )}
              onChange={(_, value) => {
                if (value && typeof value !== 'string') setRepoSearch(value.fullName);
              }}
            />
          ) : null}
          <Box>
            <ControlTooltip title="List agent markdown files in the repo">
              <span>
                <Button
                  variant="outlined"
                  disabled={previewMutation.isPending || (!workspaceId && !repoSearch.trim())}
                  onClick={() => previewMutation.mutate()}
                >
                  {previewMutation.isPending ? 'Scanning…' : 'Scan repo'}
                </Button>
              </span>
            </ControlTooltip>
          </Box>
          {preview ? (
            preview.agents.length === 0 ? (
              <Alert severity="info">
                No agents found in {preview.owner}/{preview.repo} ({preview.ref}). Looked in
                .claude/agents and agents/.
              </Alert>
            ) : (
              <Stack spacing={1}>
                <Typography variant="body2" color="text.secondary">
                  {preview.owner}/{preview.repo} @{preview.ref}
                </Typography>
                {preview.agents.map((agent: RepoAgentCandidate) => (
                  <FormControlLabel
                    key={agent.slug}
                    control={
                      <Checkbox
                        checked={selected.includes(agent.slug)}
                        onChange={() => toggle(agent.slug)}
                      />
                    }
                    label={
                      <Stack spacing={0.25}>
                        <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', alignItems: 'center' }}>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            {agent.name}
                          </Typography>
                          <Chip size="small" label={agent.slug} variant="outlined" />
                          {agent.alreadyInstalled ? (
                            <Chip size="small" label="Installed" color="primary" variant="outlined" />
                          ) : null}
                        </Stack>
                        <Typography variant="caption" color="text.secondary">
                          {agent.description}
                        </Typography>
                      </Stack>
                    }
                  />
                ))}
                <FormControlLabel
                  control={
                    <Checkbox checked={overwrite} onChange={(event) => setOverwrite(event.target.checked)} />
                  }
                  label="Overwrite agents that are already installed"
                />
              </Stack>
            )
          ) : null}
        </Stack>
  );
  const actions = (
        <>
        <Button onClick={onClose} disabled={installMutation.isPending}>
          Cancel
        </Button>
        <ControlTooltip
          title={selected.length ? `Install ${selected.length} agent(s)` : 'Select agents after scanning'}
        >
          <span>
            <Button
              variant="contained"
              disabled={selected.length === 0 || installMutation.isPending}
              onClick={() => installMutation.mutate()}
            >
              {installMutation.isPending ? 'Installing…' : 'Install'}
            </Button>
          </span>
        </ControlTooltip>
        </>
  );
  if (embedded) {
    return (
      <Stack spacing={2} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 2, p: 2 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          Install agents from repo
        </Typography>
        {inner}
        <Stack direction="row" spacing={1} sx={{ justifyContent: 'flex-end' }}>
          {actions}
        </Stack>
      </Stack>
    );
  }
  return (
    <ResponsiveDialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>Install agents from repo</DialogTitle>
      <DialogContent>{inner}</DialogContent>
      <DialogActions>{actions}</DialogActions>
    </ResponsiveDialog>
  );
}
