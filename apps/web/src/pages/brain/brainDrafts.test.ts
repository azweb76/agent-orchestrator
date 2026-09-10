import { describe, expect, it } from 'vitest';
import { brainDraftIdentity, draftToChangeFile } from '@agent-orchestrator/shared';
import type { AgentTask, PersonalAgent, PersonalSkill, TaskFollowUp } from '@agent-orchestrator/shared';
import { agentToDraft, followUpToDraft, skillToDraft, taskToDraft } from './brainDrafts';

const skill: PersonalSkill = {
  slug: 'plan-review',
  name: 'plan-review',
  description: 'Review a plan.',
  relativePath: '.claude/skills/plan-review/SKILL.md',
  content: '---\nname: plan-review\ndescription: Review a plan.\n---\n\n# Body\n',
};

const agent: PersonalAgent = {
  slug: 'doc-writer',
  name: 'doc-writer',
  description: 'Writes docs.',
  relativePath: '.claude/agents/doc-writer.md',
  content: '---\nname: doc-writer\n---\n\nAgent body\n',
};

const task: AgentTask = {
  id: 'task-1',
  name: 'build',
  title: 'Build',
  description: 'Implement the plan.',
  purpose: 'implement',
  promptTemplate: null,
  systemPrompt: null,
  allowedTools: null,
  model: 'sonnet',
  effort: 'high',
  permissionMode: 'plan',
  listed: true,
  builtIn: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

const followUp: TaskFollowUp = {
  id: 'followup-1',
  name: 'continue',
  title: 'Continue',
  description: 'Keep going.',
  prompt: 'Continue from where we left off.',
  kind: 'prompt',
  template: null,
  enabled: true,
  trigger: 'session-complete',
  builtIn: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('skillToDraft', () => {
  it('strips frontmatter from the markdown body', () => {
    const draft = skillToDraft(skill);
    expect(draft.kind).toBe('skill');
    expect(draft.slug).toBe('plan-review');
    expect(draft.content).toBe('# Body\n');
    expect(draft.content).not.toContain('---');
  });
});

describe('agentToDraft', () => {
  it('strips frontmatter and keeps the slug', () => {
    const draft = agentToDraft(agent);
    expect(draft.kind).toBe('agent');
    expect(draft.slug).toBe('doc-writer');
    expect(draft.content).toBe('Agent body\n');
  });
});

describe('taskToDraft', () => {
  it('maps nullable fields to empty strings', () => {
    const draft = taskToDraft(task);
    if (draft.kind !== 'task') throw new Error('expected a task draft');
    expect(draft.promptTemplate).toBe('');
    expect(draft.systemPrompt).toBe('');
    expect(draft.allowedTools).toBe('');
    expect(draft.id).toBe('task-1');
  });
});

describe('followUpToDraft', () => {
  it('renames kind to kindValue and maps a null template', () => {
    const draft = followUpToDraft(followUp);
    if (draft.kind !== 'follow-up') throw new Error('expected a follow-up draft');
    expect(draft.kindValue).toBe('prompt');
    expect(draft.template).toBe('');
    expect(draft.id).toBe('followup-1');
  });
});

describe('draft identity', () => {
  it('resolves identity so seeded drafts become updates, not creates', () => {
    for (const draft of [skillToDraft(skill), agentToDraft(agent), taskToDraft(task), followUpToDraft(followUp)]) {
      expect(brainDraftIdentity(draft)).toBeTruthy();
      expect(draftToChangeFile(draft, draft).action).toBe('update');
    }
  });
});
