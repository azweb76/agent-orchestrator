import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Alert, Box, Button, Chip, CircularProgress, Stack } from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import {
  buildPrCreateAgentPrompt,
  buildPrTemplatePrompt,
  isPullRequestConflicted,
  type ChatSessionTemplateId,
} from '@agent-orchestrator/shared';
import { useSendAssistantPrompt } from '../components/dashboard/useSendAssistantPrompt';
import { PullRequestDetailActions } from '../components/pr/PullRequestDetailActions';
import { PullRequestDetailSections } from '../components/pr/PullRequestDetailSections';
import { PullRequestStatusChip } from '../components/pr/PullRequestStatusChip';
import type { PullRequestDetailTab } from '../components/pr/prDetailTab';
import type { PrKickoffTemplate } from '../components/pr/prFixCopy';
import { usePullRequestDetail } from '../components/pr/usePullRequestDetail';
import { ControlTooltip } from '../components/ui/ControlTooltip';
import { PageBreadcrumbs } from '../components/ui/PageBreadcrumbs';
import { PageHeader } from '../components/ui/PageHeader';

export function PullRequestDetailPage() {
  const { owner = '', repo = '', number = '' } = useParams();
  const prNumber = Number(number);

  if (!owner || !repo || !Number.isInteger(prNumber) || prNumber <= 0) {
    return <Alert severity="error">Invalid pull request URL.</Alert>;
  }

  // Remount on route change so tab and dialog state cannot leak between PRs.
  return (
    <PullRequestDetailContent
      key={`${owner}/${repo}#${prNumber}`}
      owner={owner}
      repo={repo}
      prNumber={prNumber}
    />
  );
}

function assistantKickoffs(input: {
  open: boolean;
  archived: boolean;
  conflicted: boolean;
  failingChecks: number;
}): PrKickoffTemplate[] {
  if (!input.open || input.archived) return [];
  const kickoffs: PrKickoffTemplate[] = [];
  if (input.conflicted) kickoffs.push('resolve-conflicts');
  if (input.failingChecks > 0) kickoffs.push('fix-ci');
  kickoffs.push('address-review');
  return kickoffs;
}

function PullRequestDetailContent({
  owner,
  repo,
  prNumber,
}: {
  owner: string;
  repo: string;
  prNumber: number;
}) {
  const assistant = useSendAssistantPrompt();
  const [tab, setTab] = useState<PullRequestDetailTab>('overview');
  const [templatePending, setTemplatePending] = useState(false);
  const detail = usePullRequestDetail({ owner, repo, prNumber, tab });

  const createAgent = async () => {
    await assistant.sendPrompt(
      buildPrCreateAgentPrompt({
        owner,
        repo,
        number: prNumber,
        agentId: detail.prQuery.data?.agentId,
      }).prompt,
    );
  };

  const startTemplate = async (template: ChatSessionTemplateId) => {
    if (
      template !== 'fix-ci' &&
      template !== 'address-review' &&
      template !== 'resolve-conflicts'
    ) {
      return;
    }
    setTemplatePending(true);
    try {
      await assistant.sendPrompt(
        buildPrTemplatePrompt(
          {
            owner,
            repo,
            number: prNumber,
            agentId: detail.prQuery.data?.agentId,
          },
          template,
        ).prompt,
      );
    } finally {
      setTemplatePending(false);
    }
  };

  if (detail.prQuery.isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (detail.prQuery.error || !detail.pr) {
    return (
      <Stack spacing={2}>
        <PageBreadcrumbs
          items={[{ label: 'Pull requests', to: '/pull-requests' }, { label: `#${prNumber}` }]}
        />
        <Alert severity="error">
          {(detail.prQuery.error as Error)?.message ?? 'Pull request not found'}
        </Alert>
      </Stack>
    );
  }

  const pr = detail.pr;
  const open = pr.state === 'open' && !pr.merged;
  const kickoffs = assistantKickoffs({
    open,
    archived: pr.archived,
    conflicted: isPullRequestConflicted(pr),
    failingChecks: detail.checksQuery.data?.failing ?? 0,
  });

  return (
    <Stack spacing={2.5}>
      <PageHeader
        breadcrumbs={
          <PageBreadcrumbs
            items={[
              { label: 'Pull requests', to: '/pull-requests' },
              { label: `${owner}/${repo}` },
              { label: `#${pr.number}` },
            ]}
          />
        }
        eyebrow={`${owner}/${repo}`}
        title={
          <Stack direction="row" spacing={1} useFlexGap sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
            <Box component="span">
              #{pr.number} {pr.title}
            </Box>
            <PullRequestStatusChip pr={pr} />
            {pr.archived ? <Chip size="small" label="Archived" color="warning" variant="outlined" /> : null}
          </Stack>
        }
        actions={
          <>
            <PullRequestDetailActions
              pr={pr}
              failingChecks={detail.checksQuery.data?.failing ?? 0}
              createPending={assistant.sending && !templatePending}
              templatePending={templatePending}
              onCreateAgent={() => void createAgent()}
              onStartTemplate={(template) => void startTemplate(template)}
            />
            <ControlTooltip title="Open this pull request on GitHub">
              <Button
                variant="outlined"
                startIcon={<OpenInNewIcon />}
                href={pr.htmlUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                GitHub
              </Button>
            </ControlTooltip>
          </>
        }
      />

      {assistant.error ? <Alert severity="error">{assistant.error}</Alert> : null}

      <PullRequestDetailSections
        pr={pr}
        detail={detail}
        tab={tab}
        onTabChange={setTab}
        kickoffs={kickoffs}
        onStartKickoff={(template) => void startTemplate(template)}
        kickoffPending={templatePending}
        fixCopy="assistant"
        canWrite={open && !pr.archived}
      />
    </Stack>
  );
}
