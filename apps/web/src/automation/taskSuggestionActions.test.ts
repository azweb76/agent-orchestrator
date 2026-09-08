import { describe, expect, it } from 'vitest';
import { isOpenInNewChatClick, resolveTaskSuggestionAction } from '../components/chat/taskSuggestionActions';

describe('resolveTaskSuggestionAction', () => {
  it('sends the catalog prompt in the current chat regardless of kind', () => {
    expect(
      resolveTaskSuggestionAction({
        id: '1',
        title: 'Commit and Push',
        prompt: 'Commit all local changes.',
        kind: 'commit-and-push',
      }),
    ).toEqual({ type: 'prompt', prompt: 'Commit all local changes.' });

    expect(
      resolveTaskSuggestionAction({
        id: 'g1',
        title: 'Grade session',
        prompt: 'Review this run for efficiency.',
        kind: 'grade-session',
      }),
    ).toEqual({ type: 'prompt', prompt: 'Review this run for efficiency.' });

    expect(
      resolveTaskSuggestionAction({
        id: '2',
        title: 'Create PR (draft)',
        prompt: 'Create a draft pull request.',
        kind: 'start-template',
        template: 'create-draft-pr',
      }),
    ).toEqual({ type: 'prompt', prompt: 'Create a draft pull request.' });
  });

  it('opens a new chat with the same prompt on Cmd/Ctrl+click', () => {
    expect(
      resolveTaskSuggestionAction(
        {
          id: '2',
          title: 'Create PR (draft)',
          prompt: 'Create a draft pull request.',
          kind: 'start-template',
          template: 'create-draft-pr',
        },
        { openInNewChat: true },
      ),
    ).toEqual({
      type: 'new-prompt',
      title: 'Create PR (draft)',
      prompt: 'Create a draft pull request.',
    });
  });
});

describe('isOpenInNewChatClick', () => {
  it('detects meta and ctrl modifiers', () => {
    expect(isOpenInNewChatClick({ metaKey: true })).toBe(true);
    expect(isOpenInNewChatClick({ ctrlKey: true })).toBe(true);
    expect(isOpenInNewChatClick({})).toBe(false);
  });
});
