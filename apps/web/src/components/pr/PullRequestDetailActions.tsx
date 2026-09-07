import { Link as RouterLink } from 'react-router-dom';
import { Button } from '@mui/material';
import BugReportOutlinedIcon from '@mui/icons-material/BugReportOutlined';
import CallMergeOutlinedIcon from '@mui/icons-material/CallMergeOutlined';
import ReplyOutlinedIcon from '@mui/icons-material/ReplyOutlined';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import {
  isPullRequestConflicted,
  type ChatSessionTemplateId,
  type PullRequestDetail,
} from '@agent-orchestrator/shared';
import { ControlTooltip } from '../ui/ControlTooltip';

export interface PullRequestDetailActionsProps {
  pr: PullRequestDetail;
  failingChecks: number;
  createPending: boolean;
  templatePending: boolean;
  onCreateAgent: () => void;
  onStartTemplate: (template: ChatSessionTemplateId) => void;
}

/** Header action buttons for the PR detail page. */
export function PullRequestDetailActions({
  pr,
  failingChecks,
  createPending,
  templatePending,
  onCreateAgent,
  onStartTemplate,
}: PullRequestDetailActionsProps) {
  const open = pr.state === 'open' && !pr.merged;
  const busy = templatePending || pr.archived;
  const conflicted = isPullRequestConflicted(pr);

  return (
    <>
      {open && conflicted ? (
        <ControlTooltip
          title={
            pr.archived
              ? 'This repository is archived and read-only.'
              : 'Ask Assistant to start a resolve-conflicts session'
          }
          disabled={busy}
        >
          <Button
            variant="outlined"
            color="error"
            startIcon={<CallMergeOutlinedIcon />}
            disabled={busy}
            onClick={() => onStartTemplate('resolve-conflicts')}
          >
            Resolve conflicts
          </Button>
        </ControlTooltip>
      ) : null}
      {open && failingChecks > 0 ? (
        <ControlTooltip
          title={
            pr.archived
              ? 'This repository is archived and read-only.'
              : 'Ask Assistant to start a fix-ci session'
          }
          disabled={busy}
        >
          <Button
            variant="outlined"
            color="error"
            startIcon={<BugReportOutlinedIcon />}
            disabled={busy}
            onClick={() => onStartTemplate('fix-ci')}
          >
            Fix CI
          </Button>
        </ControlTooltip>
      ) : null}
      {open ? (
        <ControlTooltip
          title={
            pr.archived
              ? 'This repository is archived and read-only.'
              : 'Ask Assistant to start an address-review session'
          }
          disabled={busy}
        >
          <Button
            variant="outlined"
            startIcon={<ReplyOutlinedIcon />}
            disabled={busy}
            onClick={() => onStartTemplate('address-review')}
          >
            Address review
          </Button>
        </ControlTooltip>
      ) : null}
      {pr.agentId ? (
        <ControlTooltip title="Open the agent working on this pull request">
          <Button
            component={RouterLink}
            to={`/agents/${pr.agentId}`}
            variant="outlined"
            startIcon={<SmartToyOutlinedIcon />}
          >
            Open agent
          </Button>
        </ControlTooltip>
      ) : (
        <ControlTooltip
          title={
            pr.archived
              ? 'This repository is archived and read-only.'
              : pr.workspaceId
                ? 'Ask Assistant to create a worktree and Claude agent for this pull request'
                : 'Ask Assistant to clone the repository and start a Claude agent for this pull request'
          }
          disabled={createPending || pr.archived}
        >
          <Button
            variant="outlined"
            startIcon={<SmartToyOutlinedIcon />}
            disabled={createPending || pr.archived}
            onClick={onCreateAgent}
            sx={{ textTransform: 'none' }}
          >
            {createPending ? 'Asking…' : 'Ask Assistant'}
          </Button>
        </ControlTooltip>
      )}
    </>
  );
}
