import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Stack, Tab, Tabs, Typography } from '@mui/material';
import { PageHeader } from '../components/ui/PageHeader';
import { BrainAgentsPanel } from './brain/BrainAgentsPanel';
import { BrainFollowUpsPanel } from './brain/BrainFollowUpsPanel';
import { BrainSkillsPanel } from './brain/BrainSkillsPanel';
import { BrainTasksPanel } from './brain/BrainTasksPanel';
import { parseBrainTab, type BrainTab } from './brain/brainTabs';

const TAB_COPY: Record<BrainTab, string> = {
  skills:
    'Personal skills live in your user library and apply across workspaces. Project skills stay in each repo.',
  agents:
    'Personal Claude Code subagents live in ~/.claude/agents. Claude can spawn them as Task/Explore specialists.',
  tasks:
    'Agent kickoff templates: purpose, prompts, model, effort, permissions, and tools. From goal can Auto-select using purpose.',
  'follow-ups':
    'Post-session chips. After a session finishes, AI picks which enabled entries to show from this catalog.',
};

export function BrainPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = useMemo(() => parseBrainTab(searchParams.get('tab')), [searchParams]);

  const onTabChange = (_event: unknown, value: BrainTab) => {
    setSearchParams(value === 'skills' ? {} : { tab: value }, { replace: true });
  };

  return (
    <Stack spacing={2.5}>
      <PageHeader
        eyebrow="Library"
        title="Brain"
        description="User-level skills and Claude Code subagents, plus kickoff tasks and follow-up chips."
      />

      <Tabs
        value={tab}
        onChange={onTabChange}
        variant="scrollable"
        allowScrollButtonsMobile
        sx={{ borderBottom: 1, borderColor: 'divider' }}
      >
        <Tab value="skills" label="Skills" />
        <Tab value="agents" label="Agents" />
        <Tab value="tasks" label="Tasks" />
        <Tab value="follow-ups" label="Follow-ups" />
      </Tabs>

      <Typography color="text.secondary" sx={{ lineHeight: 1.5 }}>
        {TAB_COPY[tab]}
      </Typography>

      {tab === 'skills' ? <BrainSkillsPanel /> : null}
      {tab === 'agents' ? <BrainAgentsPanel /> : null}
      {tab === 'tasks' ? <BrainTasksPanel /> : null}
      {tab === 'follow-ups' ? <BrainFollowUpsPanel /> : null}
    </Stack>
  );
}
