import { Box, Stack, Typography } from '@mui/material';
import { PageHeader } from '../components/ui/PageHeader';
import { BrainAgentsPanel } from './brain/BrainAgentsPanel';
import { BrainCopilotPanel } from './brain/BrainCopilotPanel';
import { BrainFollowUpsPanel } from './brain/BrainFollowUpsPanel';
import { BrainSkillsPanel } from './brain/BrainSkillsPanel';
import { BrainSyncBar } from './brain/BrainSyncBar';
import { BrainTabStrip } from './brain/BrainTabStrip';
import { BrainTasksPanel } from './brain/BrainTasksPanel';
import { BRAIN_TAB_COPY } from './brain/brainTabs';
import { agentToDraft, followUpToDraft, skillToDraft, taskToDraft } from './brain/brainDrafts';
import { useBrainChangeSet } from './brain/useBrainChangeSet';
import { useBrainTab } from './brain/useBrainTab';

export function BrainPage() {
  const { tab, setTab } = useBrainTab();
  const copilot = useBrainChangeSet();

  const draftWithAi = (kind: Parameters<typeof copilot.draftWithAi>[0]) => {
    copilot.draftWithAi(kind);
    setTab('copilot');
  };

  const improve = (draft: Parameters<typeof copilot.improve>[0]) => {
    copilot.improve(draft);
    setTab('copilot');
  };

  return (
    <Stack spacing={2.5}>
      <PageHeader
        eyebrow="Library"
        title="Brain"
        description="User-level skills, Claude Code subagents, kickoff tasks, and follow-up chips. Create and edit them directly, or hand the work to the copilot and accept its drafts."
      />

      <BrainSyncBar />

      <BrainTabStrip tab={tab} pendingCount={copilot.pendingCount} onChange={setTab} />

      <Typography color="text.secondary" sx={{ lineHeight: 1.5 }}>
        {BRAIN_TAB_COPY[tab]}
      </Typography>

      {tab === 'skills' ? (
        <BrainSkillsPanel
          onDraftWithAi={() => draftWithAi('skill')}
          onImprove={(skill) => improve(skillToDraft(skill))}
        />
      ) : null}
      {tab === 'agents' ? (
        <BrainAgentsPanel
          onDraftWithAi={() => draftWithAi('agent')}
          onImprove={(agent) => improve(agentToDraft(agent))}
        />
      ) : null}
      {tab === 'tasks' ? (
        <BrainTasksPanel
          onDraftWithAi={() => draftWithAi('task')}
          onImprove={(task) => improve(taskToDraft(task))}
        />
      ) : null}
      {tab === 'follow-ups' ? (
        <BrainFollowUpsPanel
          onDraftWithAi={() => draftWithAi('follow-up')}
          onImprove={(followUp) => improve(followUpToDraft(followUp))}
        />
      ) : null}

      {/*
        Kept mounted on every tab: unmounting BrainCopilot aborts its SSE request, and the
        server aborts the turn when the response closes, which would silently cancel an
        in-flight generation whenever the user switched tabs.
      */}
      <Box sx={{ display: tab === 'copilot' ? 'block' : 'none' }}>
        <BrainCopilotPanel copilot={copilot} />
      </Box>
    </Stack>
  );
}
