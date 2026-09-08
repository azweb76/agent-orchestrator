import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Stack, Tab, Tabs, Typography } from '@mui/material';
import { PageHeader } from '../components/ui/PageHeader';
import { BrainAgentsPanel } from './brain/BrainAgentsPanel';
import { BrainFollowUpsPanel } from './brain/BrainFollowUpsPanel';
import { BrainSkillsPanel } from './brain/BrainSkillsPanel';
import { BrainSyncBar } from './brain/BrainSyncBar';
import { BrainTasksPanel } from './brain/BrainTasksPanel';
import { BrainWorkspace } from './brain/BrainWorkspace';
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
        description="User-level skills and Claude Code subagents, plus kickoff tasks and follow-up chips. Create and improve with the copilot — edit the draft on the page, then save."
      />

      <BrainSyncBar />

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

      <BrainWorkspace
        tab={tab}
        onTabKind={(kind) => {
          const next: BrainTab =
            kind === 'follow-up' ? 'follow-ups' : kind === 'agent' ? 'agents' : kind === 'task' ? 'tasks' : 'skills';
          setSearchParams(next === 'skills' ? {} : { tab: next }, { replace: true });
        }}
      >
        {(api) => (
          <>
            {tab === 'skills' ? (
              <BrainSkillsPanel
                selectedKey={api.selectedKey}
                onNew={api.onNew}
                onSelect={api.onSelectSkill}
                onImprove={api.onImproveSkill}
              />
            ) : null}
            {tab === 'agents' ? (
              <BrainAgentsPanel
                selectedKey={api.selectedKey}
                onNew={api.onNew}
                onSelect={api.onSelectAgent}
                onImprove={api.onImproveAgent}
              />
            ) : null}
            {tab === 'tasks' ? (
              <BrainTasksPanel
                selectedKey={api.selectedKey}
                onNew={api.onNew}
                onSelect={api.onSelectTask}
                onImprove={api.onImproveTask}
              />
            ) : null}
            {tab === 'follow-ups' ? (
              <BrainFollowUpsPanel
                selectedKey={api.selectedKey}
                onNew={api.onNew}
                onSelect={api.onSelectFollowUp}
                onImprove={api.onImproveFollowUp}
              />
            ) : null}
          </>
        )}
      </BrainWorkspace>
    </Stack>
  );
}
