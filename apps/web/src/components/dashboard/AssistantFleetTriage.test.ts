import { describe, expect, it } from 'vitest';
import {
  buildBlockedAgentPrompt,
  buildFleetTriagePrompt,
} from '@agent-orchestrator/shared';

describe('buildFleetTriagePrompt', () => {
  it('builds fix-ci prompts with PR refs', () => {
    const starter = buildFleetTriagePrompt({
      kind: 'fix-ci',
      fixCi: [
        { owner: 'acme', repo: 'demo', number: 12, agentId: 'ag-1' },
        { owner: 'acme', repo: 'demo', number: 15 },
      ],
    });
    expect(starter?.label).toBe('Fix CI on 2 PRs');
    expect(starter?.prompt).toContain('acme/demo#12');
    expect(starter?.prompt).toContain('acme/demo#15');
    expect(starter?.prompt).toContain('fix-ci');
    expect(starter?.prompt).toContain('Confirm');
  });

  it('builds address-review and archive prompts', () => {
    const review = buildFleetTriagePrompt({
      kind: 'address-review',
      addressReview: [{ owner: 'acme', repo: 'demo', number: 9, agentId: 'ag-2' }],
    });
    expect(review?.label).toBe('Address review on 1 PR');
    expect(review?.prompt).toContain('address-review');

    const archive = buildFleetTriagePrompt({
      kind: 'archive-merged',
      archiveMerged: [{ agentId: 'ag-9', name: 'Shipped' }],
    });
    expect(archive?.label).toBe('Archive 1 merged agent');
    expect(archive?.prompt).toContain('archive_agent');
    expect(archive?.prompt).toContain('confirm=true');
  });

  it('builds needs-input unblock prompts', () => {
    const starter = buildFleetTriagePrompt({
      kind: 'needs-input',
      needsInput: [
        { agentId: 'a1', name: 'Alpha' },
        { agentId: 'a2', name: 'Beta' },
      ],
    });
    expect(starter?.label).toBe('Unblock 2 agents');
    expect(starter?.prompt).toContain('List pending permissions');
  });

  it('returns null when targets are empty', () => {
    expect(buildFleetTriagePrompt({ kind: 'fix-ci', fixCi: [] })).toBeNull();
  });
});

describe('buildBlockedAgentPrompt', () => {
  it('names the agent and asks to list permissions', () => {
    const starter = buildBlockedAgentPrompt({ agentId: 'ag-7', name: 'Widget' });
    expect(starter.label).toBe('Unblock Widget');
    expect(starter.prompt).toContain('ag-7');
    expect(starter.prompt).toContain('Widget');
  });
});
