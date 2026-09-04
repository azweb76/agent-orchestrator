import { describe, expect, it } from 'vitest';
import { resolveTaskSuggestionAction } from '../components/chat/taskSuggestionActions';

describe('resolveTaskSuggestionAction', () => {
  it('maps commit-and-push chips', () => {
    expect(
      resolveTaskSuggestionAction({
        id: '1',
        title: 'Commit and Push',
        prompt: 'Commit…',
        kind: 'commit-and-push',
      }),
    ).toEqual({ type: 'commit-and-push' });
  });

  it('maps start-template chips', () => {
    const action = resolveTaskSuggestionAction({
      id: '2',
      title: 'Create PR (draft)',
      prompt: 'Create…',
      kind: 'start-template',
      template: 'create-draft-pr',
    });
    expect(action.type).toBe('start-template');
    if (action.type === 'start-template') {
      expect(action.template.id).toBe('create-draft-pr');
    }
  });

  it('defaults to sending the prompt', () => {
    expect(
      resolveTaskSuggestionAction({
        id: '3',
        title: 'Add tests',
        prompt: 'Add unit tests.',
      }),
    ).toEqual({ type: 'prompt', prompt: 'Add unit tests.' });
  });
});
