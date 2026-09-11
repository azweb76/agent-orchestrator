import type { ChatSessionTemplateId } from '@agent-orchestrator/shared';

export type PrKickoffTemplate = Extract<
  ChatSessionTemplateId,
  'fix-ci' | 'address-review' | 'resolve-conflicts'
>;

export type PrFixCopySource = 'agent' | 'assistant';

export interface PrFixCopy {
  label: string;
  busyLabel: string;
  tooltip: string;
}

const AGENT_COPY: Record<PrKickoffTemplate, PrFixCopy> = {
  'fix-ci': {
    label: 'Fix',
    busyLabel: 'Starting…',
    tooltip: 'Start a session on this agent to fix failing checks',
  },
  'resolve-conflicts': {
    label: 'Fix',
    busyLabel: 'Starting…',
    tooltip: 'Start a session on this agent to resolve merge conflicts',
  },
  'address-review': {
    label: 'Fix',
    busyLabel: 'Starting…',
    tooltip: 'Start a session on this agent to address review comments',
  },
};

const ASSISTANT_COPY: Record<PrKickoffTemplate, PrFixCopy> = {
  'fix-ci': {
    label: 'Fix CI',
    busyLabel: 'Asking…',
    tooltip: 'Ask Assistant to start a Claude agent to fix failing CI checks',
  },
  'resolve-conflicts': {
    label: 'Resolve conflicts',
    busyLabel: 'Asking…',
    tooltip: 'Ask Assistant to start a resolve-conflicts session',
  },
  'address-review': {
    label: 'Address review',
    busyLabel: 'Asking…',
    tooltip: 'Ask Assistant to start an address-review session',
  },
};

export function prFixCopy(source: PrFixCopySource, template: PrKickoffTemplate): PrFixCopy {
  return source === 'agent' ? AGENT_COPY[template] : ASSISTANT_COPY[template];
}
