import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TOOLBAR_GROUPS,
  MARKDOWN_ACTION_LABELS,
  MARKDOWN_ACTION_SHORTCUTS,
  MARKDOWN_ACTION_TRANSFORMS,
  resolveToolbarGroups,
  type MarkdownToolbarActionId,
} from './markdownEditorActions';

const ALL_IDS: MarkdownToolbarActionId[] = DEFAULT_TOOLBAR_GROUPS.flat();

describe('markdown action registry', () => {
  it('has a transform and label for every id in DEFAULT_TOOLBAR_GROUPS', () => {
    for (const id of ALL_IDS) {
      expect(typeof MARKDOWN_ACTION_TRANSFORMS[id]).toBe('function');
      expect(typeof MARKDOWN_ACTION_LABELS[id]).toBe('string');
      expect(MARKDOWN_ACTION_LABELS[id].length).toBeGreaterThan(0);
    }
  });

  it('does not define transforms/labels for ids outside DEFAULT_TOOLBAR_GROUPS', () => {
    const idSet = new Set(ALL_IDS);
    expect(Object.keys(MARKDOWN_ACTION_TRANSFORMS).sort()).toEqual([...idSet].sort());
    expect(Object.keys(MARKDOWN_ACTION_LABELS).sort()).toEqual([...idSet].sort());
  });

  it('only defines shortcuts for bold, italic, and link', () => {
    expect(Object.keys(MARKDOWN_ACTION_SHORTCUTS).sort()).toEqual(['bold', 'italic', 'link'].sort());
    expect(MARKDOWN_ACTION_SHORTCUTS.bold).toBeTruthy();
    expect(MARKDOWN_ACTION_SHORTCUTS.italic).toBeTruthy();
    expect(MARKDOWN_ACTION_SHORTCUTS.link).toBeTruthy();
  });

  it('has no duplicate ids across the default groups', () => {
    expect(ALL_IDS.length).toBe(new Set(ALL_IDS).size);
  });

  it('has 5 groups in the documented order', () => {
    expect(DEFAULT_TOOLBAR_GROUPS).toHaveLength(5);
    expect(DEFAULT_TOOLBAR_GROUPS[0]).toEqual(['heading1', 'heading2', 'heading3']);
    expect(DEFAULT_TOOLBAR_GROUPS[1]).toEqual(['bold', 'italic', 'strikethrough', 'inlineCode']);
    expect(DEFAULT_TOOLBAR_GROUPS[2]).toEqual(['codeBlock']);
    expect(DEFAULT_TOOLBAR_GROUPS[3]).toEqual(['bulletList', 'numberedList', 'taskList', 'blockquote']);
    expect(DEFAULT_TOOLBAR_GROUPS[4]).toEqual(['link', 'table', 'horizontalRule']);
  });
});

describe('resolveToolbarGroups', () => {
  it('returns the default groups when called with no argument', () => {
    expect(resolveToolbarGroups()).toBe(DEFAULT_TOOLBAR_GROUPS);
  });

  it('returns the default groups when called with undefined', () => {
    expect(resolveToolbarGroups(undefined)).toBe(DEFAULT_TOOLBAR_GROUPS);
  });

  it('filters each group down to only the allowed ids, preserving group order', () => {
    const result = resolveToolbarGroups(['bold', 'link', 'heading1']);
    expect(result).toEqual([['heading1'], ['bold'], ['link']]);
  });

  it('drops groups that become empty after filtering', () => {
    const result = resolveToolbarGroups(['codeBlock']);
    expect(result).toEqual([['codeBlock']]);
  });

  it('ignores unknown ids in the allow-list', () => {
    const result = resolveToolbarGroups(['bold', 'not-a-real-action' as MarkdownToolbarActionId]);
    expect(result).toEqual([['bold']]);
  });

  it('ignores duplicate ids in the allow-list without duplicating output', () => {
    const result = resolveToolbarGroups(['bold', 'bold', 'italic']);
    expect(result).toEqual([['bold', 'italic']]);
  });

  it('returns an empty array when nothing in the allow-list matches', () => {
    expect(resolveToolbarGroups([])).toEqual([]);
    expect(resolveToolbarGroups(['not-a-real-action' as MarkdownToolbarActionId])).toEqual([]);
  });
});
