export const BRAIN_TABS = ['skills', 'agents', 'tasks', 'follow-ups'] as const;

export type BrainTab = (typeof BRAIN_TABS)[number];

export function parseBrainTab(value: string | null | undefined): BrainTab {
  if (value === 'tasks' || value === 'follow-ups' || value === 'skills' || value === 'agents') {
    return value;
  }
  return 'skills';
}

export function brainPath(tab: BrainTab = 'skills'): string {
  return tab === 'skills' ? '/brain' : `/brain?tab=${tab}`;
}
