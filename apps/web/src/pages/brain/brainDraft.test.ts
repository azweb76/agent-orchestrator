import { describe, expect, it } from 'vitest';
import {
  brainCreatePrompt,
  brainChangeSetCanAccept,
  draftToChangeFile,
  emptyBrainChangeSet,
  emptyBrainDraft,
  formatAskUserAnswers,
  formatReferencedSessionPrompt,
  latestAskUserQuestionsFromMessages,
  mergeBrainDraft,
  mergeProposedLibraryFiles,
  parseBrainDraft,
  parseBrainLibraryFiles,
  undoBrainChangeFile,
  type AssistantMessage,
} from '@agent-orchestrator/shared';

describe('parseBrainDraft', () => {
  it('parses a nested skill draft JSON string', () => {
    const draft = parseBrainDraft(
      JSON.stringify({
        ok: true,
        draft: {
          kind: 'skill',
          name: 'use-explore',
          description: 'Explore first',
          content: '---\nname: use-explore\n---\nUse Explore before Grep.',
        },
      }),
    );
    expect(draft?.kind).toBe('skill');
    if (draft?.kind === 'skill') {
      expect(draft.name).toBe('use-explore');
      expect(draft.content).toContain('Use Explore');
      expect(draft.content.startsWith('---')).toBe(false);
    }
  });
});

describe('mergeBrainDraft', () => {
  it('keeps dirty fields', () => {
    const current = emptyBrainDraft('skill');
    if (current.kind !== 'skill') throw new Error('expected skill');
    current.name = 'mine';
    current.content = 'edited';
    const proposed = emptyBrainDraft('skill');
    if (proposed.kind !== 'skill') throw new Error('expected skill');
    proposed.name = 'theirs';
    proposed.content = 'from-ai';
    proposed.description = 'when to use';
    const merged = mergeBrainDraft(current, proposed, new Set(['name', 'content']));
    expect(merged.kind).toBe('skill');
    if (merged.kind === 'skill') {
      expect(merged.name).toBe('mine');
      expect(merged.content).toBe('edited');
      expect(merged.description).toBe('when to use');
    }
  });
});

describe('ask_user pending questions', () => {
  it('hides questions after the user replies', () => {
    const ask: AssistantMessage = {
      id: 't1',
      role: 'tool',
      content: JSON.stringify({
        questions: [{ question: 'Scope?', options: [{ label: 'Personal', description: '' }] }],
      }),
      toolResult: { toolUseId: '1', toolName: 'ask_user', awaitingUser: true },
      createdAt: new Date().toISOString(),
    };
    expect(latestAskUserQuestionsFromMessages([ask])?.[0]?.question).toBe('Scope?');
    expect(
      latestAskUserQuestionsFromMessages([
        ask,
        { id: 'u1', role: 'user', content: 'Personal', createdAt: new Date().toISOString() },
      ]),
    ).toBeNull();
  });
});

describe('brain prompts', () => {
  it('asks the model to use ask_user and not write files', () => {
    expect(brainCreatePrompt('agent')).toMatch(/ask_user/);
    expect(brainCreatePrompt('agent')).toMatch(/propose_brain_draft/);
    expect(brainCreatePrompt('agent')).toMatch(/files array/);
    expect(formatAskUserAnswers({ Scope: 'Personal' })).toBe('Answers:\nScope: Personal');
  });
});

describe('brain library changeset', () => {
  it('parses a files array from propose_brain_draft payload', () => {
    const files = parseBrainLibraryFiles({
      ok: true,
      files: [
        { kind: 'skill', name: 'always-run-tests', content: 'Run tests.' },
        { kind: 'agent', name: 'reviewer', content: 'Review diffs.' },
      ],
    });
    expect(files).toHaveLength(2);
    expect(files[0]?.kind).toBe('skill');
    expect(files[1]?.kind).toBe('agent');
  });

  it('parses task and follow-up drafts in the files array', () => {
    const files = parseBrainLibraryFiles({
      files: [
        {
          kind: 'task',
          name: 'plan-feature',
          title: 'Plan feature',
          purpose: 'plan',
          promptTemplate: 'Plan {{goal}}',
        },
        {
          kind: 'follow-up',
          name: 'create-pr',
          title: 'Create PR',
          prompt: 'Open a draft PR',
          kindValue: 'prompt',
        },
      ],
    });
    expect(files).toHaveLength(2);
    expect(files[0]?.kind).toBe('task');
    expect(files[1]?.kind).toBe('follow-up');
    const set = mergeProposedLibraryFiles(emptyBrainChangeSet(), files);
    expect(set.files).toHaveLength(2);
    expect(brainChangeSetCanAccept(set)).toBe(true);
  });

  it('merges proposals without clobbering dirty fields and undo drops a file', () => {
    const first = mergeProposedLibraryFiles(emptyBrainChangeSet(), [
      { kind: 'skill', name: 'always-run-tests', description: 'a', content: 'from-ai' },
      { kind: 'agent', slug: 'reviewer', name: 'reviewer', description: 'b', content: 'agent body' },
    ]);
    expect(first.files).toHaveLength(2);
    expect(brainChangeSetCanAccept(first)).toBe(true);
    const edited = {
      ...first,
      files: first.files.map((file) =>
        file.kind === 'skill' && file.draft.kind === 'skill'
          ? { ...file, draft: { ...file.draft, content: 'edited' }, dirtyKeys: ['content'] }
          : file,
      ),
    };
    const merged = mergeProposedLibraryFiles(edited, [
      { kind: 'skill', name: 'always-run-tests', description: 'updated', content: 'from-ai-2' },
    ]);
    const skill = merged.files.find((file) => file.kind === 'skill');
    expect(skill?.draft.kind === 'skill' && skill.draft.content).toBe('edited');
    expect(skill?.draft.kind === 'skill' && skill.draft.description).toBe('updated');
    const undone = undoBrainChangeFile(merged, skill?.id ?? '');
    expect(undone.files).toHaveLength(1);
    expect(undone.files[0]?.kind).toBe('agent');
  });

  it('formats referenced session ids for the copilot', () => {
    const text = formatReferencedSessionPrompt(
      [
        {
          id: 'sess-1',
          agentId: 'ag-1',
          title: 'Build',
          template: 'build',
          score: 2,
          comment: 'Skipped tests',
          findingTitles: ['Never ran tests'],
          gradedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      'Capture a skill from this.',
    );
    expect(text).toMatch(/sess-1/);
    expect(text).toMatch(/get_session_grade/);
    expect(text).toMatch(/Capture a skill from this/);
  });

  it('seeds an update file from a library row', () => {
    const file = draftToChangeFile(
      { kind: 'skill', slug: 'always-run-tests', name: 'Always run tests', description: '', content: 'Run them.' },
    );
    expect(file.action).toBe('update');
    expect(file.draft.kind === 'skill' && file.draft.slug).toBe('always-run-tests');
  });
});
