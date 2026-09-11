import { useState } from 'react';
import { Alert, Box, Button, Chip, CircularProgress, Stack, Typography } from '@mui/material';
import CallMergeOutlinedIcon from '@mui/icons-material/CallMergeOutlined';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import type { AgentDetail } from '@agent-orchestrator/shared';
import type { AgentPrKickoffTemplate } from './agentPrStatusSummary';
import { buildAgentPrStatusSummary } from './agentPrStatusSummary';
import { PullRequestDetailSections } from '../pr/PullRequestDetailSections';
import { PullRequestStatusChip } from '../pr/PullRequestStatusChip';
import type { PullRequestDetailTab } from '../pr/prDetailTab';
import { usePullRequestDetail } from '../pr/usePullRequestDetail';
import { ControlTooltip } from '../ui/ControlTooltip';
import { EmptyState } from '../ui/EmptyState';

export interface AgentPrPanelProps {
  agent: AgentDetail;
  archived: boolean;
  enabled: boolean;
  onCreateDraftPr: () => void;
  onStartKickoff: (template: AgentPrKickoffTemplate) => void;
}

export function AgentPrPanel({
  agent,
  archived,
  enabled,
  onCreateDraftPr,
  onStartKickoff,
}: AgentPrPanelProps) {
  const prNumber = agent.worktree.prNumber;
  const hasPr = prNumber != null && prNumber > 0;
  const [tab, setTab] = useState<PullRequestDetailTab>('overview');
  const detail = usePullRequestDetail({
    owner: agent.workspace.githubOwner,
    repo: agent.workspace.githubRepo,
    prNumber: prNumber ?? 0,
    tab,
    enabled: enabled && hasPr,
  });

  if (!hasPr) {
    return (
      <Box sx={{ p: { xs: 1.5, sm: 2 }, overflow: 'auto' }}>
        <EmptyState
          compact
          icon={<CallMergeOutlinedIcon />}
          title="No pull request yet"
          description="Create a draft PR from this worktree to track checks, reviews, and merge readiness here."
          action={
            archived ? undefined : (
              <Button variant="contained" onClick={onCreateDraftPr}>
                Create Draft PR
              </Button>
            )
          }
        />
      </Box>
    );
  }

  if (detail.prQuery.isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (detail.prQuery.error || !detail.pr) {
    return (
      <Box sx={{ p: { xs: 1.5, sm: 2 } }}>
        <Alert severity="error">
          {(detail.prQuery.error as Error)?.message ?? `Pull request #${prNumber} not found`}
        </Alert>
      </Box>
    );
  }

  const pr = detail.pr;
  const model = buildAgentPrStatusSummary({
    pr,
    checks: detail.checks,
    archived,
    sessions: agent.sessions,
  });

  return (
    <Stack spacing={2} sx={{ p: { xs: 1.5, sm: 2 }, height: '100%', overflow: 'auto' }}>
      <Stack
        direction="row"
        spacing={1}
        useFlexGap
        sx={{ alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}
      >
        <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap', minWidth: 0 }}>
          <Typography variant="h6" sx={{ fontWeight: 700, overflowWrap: 'anywhere' }}>
            #{pr.number} {pr.title}
          </Typography>
          <PullRequestStatusChip pr={pr} />
          {pr.archived ? <Chip size="small" label="Archived" color="warning" variant="outlined" /> : null}
        </Stack>
        <ControlTooltip title="Open this pull request on GitHub">
          <Button
            variant="outlined"
            size="small"
            startIcon={<OpenInNewIcon />}
            href={pr.htmlUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub
          </Button>
        </ControlTooltip>
      </Stack>

      <PullRequestDetailSections
        pr={pr}
        detail={detail}
        tab={tab}
        onTabChange={setTab}
        kickoffs={model.kickoffs}
        onStartKickoff={onStartKickoff}
        fixCopy="agent"
        canWrite={model.open && !archived && !pr.archived}
      />
    </Stack>
  );
}
