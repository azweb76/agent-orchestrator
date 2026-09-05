import { describe, expect, it } from 'vitest';
import {
  isOpenInNewChatClick,
  resolveTaskSuggestionAction,
} from '../components/chat/taskSuggestionActions';

describe('resolveTaskSuggestionAction', () => {
  it('maps commit-and-push chips on normal click', () => {
    expect(
      resolveTaskSuggestionAction({
        id: '1',
        title: 'Commit and Push',
        prompt: 'Commit…',
        kind: 'commit-and-push',
      }),
    ).toEqual({ type: 'commit-and-push' });
  });

  it('sends start-template prompts in the current chat on normal click', () => {
    expect(
      resolveTaskSuggestionAction({
        id: '2',
        title: 'Create PR (draft)',
        prompt: 'Create…',
        kind: 'start-template',
        template: 'create-draft-pr',
      }),
    ).toEqual({ type: 'prompt', prompt: 'Create…' });
  });

  it('defaults to sending the prompt in the current chat', () => {
    expect(
      resolveTaskSuggestionAction({
        id: '3',
        title: 'Add tests',
        prompt: 'Add unit tests.',
      }),
    ).toEqual({ type: 'prompt', prompt: 'Add unit tests.' });
  });

  it('opens start-template sessions on Cmd/Ctrl+click', () => {
    const action = resolveTaskSuggestionAction(
      {
        id: '2',
        title: 'Create PR (draft)',
        prompt: 'Create…',
        kind: 'start-template',
        template: 'create-draft-pr',
      },
      { openInNewChat: true },
    );
    expect(action.type).toBe('start-template');
    if (action.type === 'start-template') {
      expect(action.template.id).toBe('create-draft-pr');
    }
  });

  it('opens a new chat with the prompt on Cmd/Ctrl+click for prompt kinds', () => {
    expect(
      resolveTaskSuggestionAction(
        {
          id: '3',
          title: 'Add tests',
          prompt: 'Add unit tests.',
        },
        { openInNewChat: true },
      ),
    ).toEqual({
      type: 'new-prompt',
      title: 'Add tests',
      prompt: 'Add unit tests.',
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
