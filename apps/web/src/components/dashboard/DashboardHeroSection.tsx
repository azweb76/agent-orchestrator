import { Link as RouterLink } from 'react-router-dom';
import { Box, Button, Stack, useTheme } from '@mui/material';
import DeleteSweepOutlinedIcon from '@mui/icons-material/DeleteSweepOutlined';
import FlightOutlinedIcon from '@mui/icons-material/FlightOutlined';
import { ControlTooltip } from '../ui/ControlTooltip';
import { CommandCenterHero } from './CommandCenterHero';
import { AssistantBriefing } from './AssistantBriefing';
import { FleetBulkSection } from '../commandPalette/FleetBulkSection';
import type { PullRequestInbox, SidebarWorkspace } from '@agent-orchestrator/shared';

interface DashboardHeroSectionProps {
  githubLogin?: string | null;
  githubConfigured: boolean;
  sidebar?: SidebarWorkspace[];
  inbox?: PullRequestInbox;
  archivedCount: number;
  onPruneClick: () => void;
}

export function DashboardHeroSection({
  githubLogin,
  githubConfigured,
  sidebar,
  inbox,
  archivedCount,
  onPruneClick,
}: DashboardHeroSectionProps) {
  const theme = useTheme();
  const ao = theme.palette.ao;

  return (
    <Box
      sx={{
        position: 'relative',
        borderRadius: 2,
        border: '1px solid',
        borderColor: 'divider',
        overflow: 'hidden',
        px: { xs: 2, md: 3.5 },
        py: { xs: 2.25, md: 3 },
        background: ao.gradient.hero,
      }}
    >
      <CommandCenterHero githubLogin={githubLogin} />

      <AssistantBriefing />

      <FleetBulkSection
        inbox={inbox}
        sidebar={sidebar ?? []}
        githubConfigured={githubConfigured}
      />

      <Stack direction="row" spacing={1} useFlexGap sx={{ mt: 2, flexWrap: 'wrap' }}>
        <ControlTooltip title="Open the flight controller airspace map">
          <Button
            component={RouterLink}
            to="/flight"
            variant="outlined"
            startIcon={<FlightOutlinedIcon />}
            size="small"
          >
            Flight board
          </Button>
        </ControlTooltip>
        {archivedCount > 0 ? (
          <ControlTooltip
            title={`Permanently delete ${archivedCount} archived agent${archivedCount === 1 ? '' : 's'}`}
          >
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
