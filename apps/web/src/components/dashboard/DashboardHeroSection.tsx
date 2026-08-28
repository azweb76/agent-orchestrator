import type { FormEvent } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  Box,
  Button,
  InputAdornment,
  Stack,
  TextField,
  useTheme,
} from '@mui/material';
import FolderOpenOutlinedIcon from '@mui/icons-material/FolderOpenOutlined';
import DeleteSweepOutlinedIcon from '@mui/icons-material/DeleteSweepOutlined';
import MergeTypeIcon from '@mui/icons-material/MergeType';
import SearchIcon from '@mui/icons-material/Search';
import { useCommandPalette } from '../commandPalette/CommandPaletteContext';
import { paletteShortcutLabel } from '../commandPalette/paletteCommands';
import { ControlTooltip } from '../ui/ControlTooltip';
import { CommandCenterHero } from './CommandCenterHero';
import { JarvisBriefing } from './JarvisBriefing';
import type { DashboardAgent } from './dashboardAgents';
import type { PullRequestInbox } from '@agent-orchestrator/shared';

interface DashboardHeroSectionProps {
  query: string;
  onQueryChange: (value: string) => void;
  onCommandSubmit: (event: FormEvent) => void;
  githubLogin?: string | null;
  systemsOk: boolean;
  systemsPartial: boolean;
  githubConfigured: boolean;
  activeAgents: DashboardAgent[];
  inbox?: PullRequestInbox;
  archivedCount: number;
  onPruneClick: () => void;
}

export function DashboardHeroSection({
  query,
  onQueryChange,
  onCommandSubmit,
  githubLogin,
  systemsOk,
  systemsPartial,
  githubConfigured,
  activeAgents,
  inbox,
  archivedCount,
  onPruneClick,
}: DashboardHeroSectionProps) {
  const theme = useTheme();
  const ao = theme.palette.ao;
  const { openPalette } = useCommandPalette();

  return (
    <Box
      sx={{
        position: 'relative',
        borderRadius: 2,
        border: '1px solid',
        borderColor: 'divider',
        overflow: 'hidden',
        px: { xs: 2, md: 3.5 },
        py: { xs: 2.25, md: 3.5 },
        background: ao.gradient.hero,
      }}
    >
      <CommandCenterHero githubLogin={githubLogin} />

      <JarvisBriefing
        systemsOk={systemsOk}
        systemsPartial={systemsPartial}
        githubConfigured={githubConfigured}
        agents={activeAgents.map((agent) => ({
          id: agent.id,
          name: agent.name,
          workspaceName: agent.workspaceName,
          status: agent.status,
          pendingPermissionCount: agent.pendingPermissionCount ?? 0,
        }))}
        inbox={inbox}
      />

      <Box component="form" onSubmit={onCommandSubmit} sx={{ mt: 2.5, maxWidth: 640 }}>
        <ControlTooltip title="Search agents by name, workspace, or branch">
          <TextField
            fullWidth
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Find an agent, workspace, or branch…"
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                  </InputAdornment>
                ),
                endAdornment: (
                  <InputAdornment position="end">
                    <ControlTooltip title={`Open the command palette (${paletteShortcutLabel()})`}>
                      <Button
                        size="small"
                        onClick={openPalette}
                        aria-label="Open command palette"
                        sx={{
                          minWidth: 0,
                          px: 1,
                          color: 'text.secondary',
                          fontFamily: '"IBM Plex Mono", monospace',
                          fontSize: '0.75rem',
                        }}
                      >
                        {paletteShortcutLabel()}
                      </Button>
                    </ControlTooltip>
                  </InputAdornment>
                ),
                'aria-label': 'Search agents',
              },
            }}
            sx={{
              '& .MuiOutlinedInput-root': {
                bgcolor: 'ao.surface.overlay',
                fontFamily: '"IBM Plex Mono", monospace',
                fontSize: '0.9rem',
              },
            }}
          />
        </ControlTooltip>
      </Box>

      <Stack direction="row" spacing={1} useFlexGap sx={{ mt: 2, flexWrap: 'wrap' }}>
        <ControlTooltip title="Browse and manage cloned repositories">
          <Button
            component={RouterLink}
            to="/workspaces"
            variant="contained"
            startIcon={<FolderOpenOutlinedIcon />}
            size="small"
          >
            Workspaces
          </Button>
        </ControlTooltip>
        <ControlTooltip title="Open your pull request inbox">
          <Button
            component={RouterLink}
            to="/pull-requests"
            variant="outlined"
            startIcon={<MergeTypeIcon />}
            size="small"
          >
            Pull requests
          </Button>
        </ControlTooltip>
        {archivedCount > 0 ? (
          <ControlTooltip title={`Permanently delete ${archivedCount} archived agent${archivedCount === 1 ? '' : 's'}`}>
            <Button
              variant="outlined"
              color="warning"
              startIcon={<DeleteSweepOutlinedIcon />}
              size="small"
              onClick={onPruneClick}
            >
              Prune archived ({archivedCount})
            </Button>
          </ControlTooltip>
        ) : null}
      </Stack>
    </Box>
  );
}
