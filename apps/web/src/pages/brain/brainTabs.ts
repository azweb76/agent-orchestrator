export const BRAIN_TABS = ['skills', 'agents', 'tasks', 'follow-ups', 'copilot'] as const;

export type BrainTab = (typeof BRAIN_TABS)[number];

export function parseBrainTab(value: string | null | undefined): BrainTab {
  return (BRAIN_TABS as readonly string[]).includes(value ?? '') ? (value as BrainTab) : 'skills';
}

export function brainPath(tab: BrainTab = 'skills'): string {
  return tab === 'skills' ? '/brain' : `/brain?tab=${tab}`;
}

/** Tab strip labels. Exhaustive by type, so a new tab must declare one. */
export const BRAIN_TAB_LABELS: Record<BrainTab, string> = {
  skills: 'Skills',
  agents: 'Agents',
  tasks: 'Tasks',
  'follow-ups': 'Follow-ups',
  copilot: 'Copilot',
};

/** Explainer shown under the tab strip. Exhaustive by type. */
export const BRAIN_TAB_COPY: Record<BrainTab, string> = {
  skills:
    'Personal skills live in your user library (~/.claude/skills) and apply across every workspace. New skill creates one directly; Draft with AI hands the work to the Copilot tab. Project skills stay in each repo.',
  agents:
    'Personal Claude Code subagents live in ~/.claude/agents. New agent creates one directly; Draft with AI hands the work to the Copilot tab.',
  tasks:
    'Agent kickoff templates: purpose, prompts, model, effort, permissions, and tools. New task creates one directly; Draft with AI hands the work to the Copilot tab. From goal can Auto-select using purpose.',
  'follow-ups':
    'Post-session chips. After a session finishes, AI picks which enabled entries to show. New follow-up creates one directly; Draft with AI hands the work to the Copilot tab.',
  copilot:
    'Ask the copilot to draft one or more skills, agents, tasks, or follow-ups at once. Edit or chat to refine, undo what you do not want, then Accept to write them to your library.',
};
