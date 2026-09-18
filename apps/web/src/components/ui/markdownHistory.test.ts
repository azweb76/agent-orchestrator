import { describe, expect, it } from 'vitest';
import { createHistory, isContinuousEdit, recordEdit, redo, undo } from './markdownHistory';

function entry(value: string, selectionStart = value.length, selectionEnd = value.length) {
  return { value, selectionStart, selectionEnd };
}

describe('createHistory', () => {
  it('starts with an empty past and future', () => {
    const state = createHistory(entry('hello'));
    expect(state.past).toEqual([]);
    expect(state.future).toEqual([]);
    expect(state.present).toEqual(entry('hello'));
  });
});

describe('recordEdit', () => {
  it('pushes a new past entry when not coalescing', () => {
    const state = recordEdit(createHistory(entry('a')), entry('ab'), false);
    expect(state.past).toEqual([entry('a')]);
    expect(state.present).toEqual(entry('ab'));
  });

  it('merges into the present when coalescing', () => {
    const state = recordEdit(createHistory(entry('a')), entry('ab'), true);
    expect(state.past).toEqual([]);
    expect(state.present).toEqual(entry('ab'));
  });

  it('clears the future on any new edit', () => {
    const withFuture = { past: [], present: entry('a'), future: [entry('a-redo')] };
    expect(recordEdit(withFuture, entry('ab'), false).future).toEqual([]);
    expect(recordEdit(withFuture, entry('ab'), true).future).toEqual([]);
  });

  it('only updates selection when the value is unchanged, without pushing history', () => {
    const state = recordEdit(createHistory(entry('a', 0, 0)), entry('a', 1, 1), false);
    expect(state.past).toEqual([]);
    expect(state.present).toEqual(entry('a', 1, 1));
  });
});

describe('undo/redo', () => {
  it('returns null when there is nothing to undo or redo', () => {
    const state = createHistory(entry('a'));
    expect(undo(state)).toBeNull();
    expect(redo(state)).toBeNull();
  });

  it('moves the present entry back into the past and restores the previous entry', () => {
    let state = createHistory(entry('a'));
    state = recordEdit(state, entry('ab'), false);
    state = recordEdit(state, entry('abc'), false);

    const undone = undo(state);
    expect(undone).not.toBeNull();
    expect(undone!.present).toEqual(entry('ab'));
    expect(undone!.past).toEqual([entry('a')]);
    expect(undone!.future).toEqual([entry('abc')]);
  });

  it('redo restores what undo just removed', () => {
    let state = createHistory(entry('a'));
    state = recordEdit(state, entry('ab'), false);
    const undone = undo(state)!;
    const redone = redo(undone);
    expect(redone).toEqual(state);
  });

  it('a new edit after undo discards the redo future', () => {
    let state = createHistory(entry('a'));
    state = recordEdit(state, entry('ab'), false);
    const undone = undo(state)!;
    const edited = recordEdit(undone, entry('az'), false);
    expect(edited.future).toEqual([]);
    expect(redo(edited)).toBeNull();
  });
});

describe('isContinuousEdit', () => {
  it('is true for a small, recent edit', () => {
    expect(isContinuousEdit('a', 'ab', 50)).toBe(true);
    expect(isContinuousEdit('ab', 'a', 50)).toBe(true);
  });

  it('is false once the gap since the last edit is too long', () => {
    expect(isContinuousEdit('a', 'ab', 601)).toBe(false);
  });

  it('is false for a large jump such as a paste', () => {
    expect(isContinuousEdit('a', 'a whole pasted paragraph', 50)).toBe(false);
  });
});
