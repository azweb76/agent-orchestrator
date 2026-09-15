import type { MarkdownTransform } from './markdownTransforms';
import {
  insertHorizontalRule,
  insertLink,
  insertTable,
  toggleBlockquote,
  toggleBold,
  toggleBulletList,
  toggleCodeBlock,
  toggleHeading1,
  toggleHeading2,
  toggleHeading3,
  toggleInlineCode,
  toggleItalic,
  toggleNumberedList,
  toggleStrikethrough,
  toggleTaskList,
} from './markdownTransforms';

export type MarkdownToolbarActionId =
  | 'heading1'
  | 'heading2'
  | 'heading3'
  | 'bold'
  | 'italic'
  | 'strikethrough'
  | 'inlineCode'
  | 'codeBlock'
  | 'bulletList'
  | 'numberedList'
  | 'taskList'
  | 'blockquote'
  | 'link'
  | 'table'
  | 'horizontalRule';

export const MARKDOWN_ACTION_TRANSFORMS: Record<MarkdownToolbarActionId, MarkdownTransform> = {
  heading1: toggleHeading1,
  heading2: toggleHeading2,
  heading3: toggleHeading3,
  bold: toggleBold,
  italic: toggleItalic,
  strikethrough: toggleStrikethrough,
  inlineCode: toggleInlineCode,
  codeBlock: toggleCodeBlock,
  bulletList: toggleBulletList,
  numberedList: toggleNumberedList,
  taskList: toggleTaskList,
  blockquote: toggleBlockquote,
  link: insertLink,
  table: insertTable,
  horizontalRule: insertHorizontalRule,
};

export const MARKDOWN_ACTION_LABELS: Record<MarkdownToolbarActionId, string> = {
  heading1: 'Heading 1',
  heading2: 'Heading 2',
  heading3: 'Heading 3',
  bold: 'Bold',
  italic: 'Italic',
  strikethrough: 'Strikethrough',
  inlineCode: 'Inline code',
  codeBlock: 'Code block',
  bulletList: 'Bulleted list',
  numberedList: 'Numbered list',
  taskList: 'Task list',
  blockquote: 'Blockquote',
  link: 'Insert link',
  table: 'Insert table',
  horizontalRule: 'Horizontal rule',
};

export const MARKDOWN_ACTION_SHORTCUTS: Partial<Record<MarkdownToolbarActionId, string>> = {
  bold: '⌘B',
  italic: '⌘I',
  link: '⌘K',
};

export const DEFAULT_TOOLBAR_GROUPS: MarkdownToolbarActionId[][] = [
  ['heading1', 'heading2', 'heading3'],
  ['bold', 'italic', 'strikethrough', 'inlineCode'],
  ['codeBlock'],
  ['bulletList', 'numberedList', 'taskList', 'blockquote'],
  ['link', 'table', 'horizontalRule'],
];

export function resolveToolbarGroups(allowed?: MarkdownToolbarActionId[]): MarkdownToolbarActionId[][] {
  if (!allowed) return DEFAULT_TOOLBAR_GROUPS;
  const allowedSet = new Set(allowed);
  return DEFAULT_TOOLBAR_GROUPS.map((group) => group.filter((id) => allowedSet.has(id))).filter(
    (group) => group.length > 0,
  );
}
