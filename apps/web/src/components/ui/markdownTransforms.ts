export interface MarkdownSelection {
  value: string;
  selectionStart: number;
  selectionEnd: number;
}

export type MarkdownTransform = (selection: MarkdownSelection) => MarkdownSelection;

export const MARKDOWN_PLACEHOLDERS = {
  bold: 'bold text',
  italic: 'italic text',
  strikethrough: 'strikethrough text',
  inlineCode: 'code',
  codeBlock: 'code',
  heading: 'Heading',
  bulletList: 'List item',
  numberedList: 'List item',
  taskList: 'Task',
  blockquote: 'Quote',
  linkText: 'text',
  linkUrl: 'url',
  table: 'Column',
} as const;

function clampNum(n: number, len: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(Math.trunc(n), len));
}

function finish(value: string, start: number, end: number): MarkdownSelection {
  const len = value.length;
  return { value, selectionStart: clampNum(start, len), selectionEnd: clampNum(end, len) };
}

function bounds(sel: MarkdownSelection): { value: string; lo: number; hi: number } {
  const len = sel.value.length;
  const a = clampNum(sel.selectionStart, len);
  const b = clampNum(sel.selectionEnd, len);
  return { value: sel.value, lo: Math.min(a, b), hi: Math.max(a, b) };
}

function stripCR(sel: MarkdownSelection): MarkdownSelection {
  if (!sel.value.includes('\r')) return sel;
  let start = sel.selectionStart;
  let end = sel.selectionEnd;
  let value = '';
  for (let i = 0; i < sel.value.length; i += 1) {
    const ch = sel.value[i];
    if (ch === '\r') {
      if (i < sel.selectionStart) start -= 1;
      if (i < sel.selectionEnd) end -= 1;
      continue;
    }
    value += ch;
  }
  return { value, selectionStart: start, selectionEnd: end };
}

// ---- inline surround marks: bold, italic, strikethrough, inline code ----
function repeatedChar(marker: string): string | null {
  const ch = marker[0];
  return marker.length > 0 && [...marker].every((c) => c === ch) ? ch : null;
}

// Matches `marker` at `value[from, from+marker.length)`, guarding against a longer run of the
// same repeated character (e.g. a lone "_" boundary check must not fire inside "__bold__").
function matchesMarker(value: string, from: number, marker: string, outsideIndex: number): boolean {
  if (from < 0 || from + marker.length > value.length) return false;
  if (value.slice(from, from + marker.length) !== marker) return false;
  const ch = repeatedChar(marker);
  if (ch && outsideIndex >= 0 && outsideIndex < value.length && value[outsideIndex] === ch) return false;
  return true;
}

function toggleSurround(sel: MarkdownSelection, marker: string, placeholder: string): MarkdownSelection {
  const { value, lo, hi } = bounds(sel);
  const beforeIsMarker = matchesMarker(value, lo - marker.length, marker, lo - marker.length - 1);
  const afterIsMarker = matchesMarker(value, hi, marker, hi + marker.length);

  if (lo === hi) {
    if (beforeIsMarker && afterIsMarker) {
      const newValue = value.slice(0, lo - marker.length) + value.slice(hi + marker.length);
      const caret = lo - marker.length;
      return finish(newValue, caret, caret);
    }
    const newValue = value.slice(0, lo) + marker + placeholder + marker + value.slice(hi);
    const selStart = lo + marker.length;
    return finish(newValue, selStart, selStart + placeholder.length);
  }

  const startHasMarker = matchesMarker(value, lo, marker, lo - 1);
  const endHasMarker = matchesMarker(value, hi - marker.length, marker, hi);
  if (startHasMarker && endHasMarker && hi - lo >= marker.length * 2) {
    const inner = value.slice(lo + marker.length, hi - marker.length);
    const newValue = value.slice(0, lo) + inner + value.slice(hi);
    return finish(newValue, lo, lo + inner.length);
  }

  if (beforeIsMarker && afterIsMarker) {
    const newValue = value.slice(0, lo - marker.length) + value.slice(lo, hi) + value.slice(hi + marker.length);
    return finish(newValue, lo - marker.length, hi - marker.length);
  }

  const selectedText = value.slice(lo, hi);
  const lead = selectedText.match(/^\s*/)?.[0] ?? '';
  const trailMatch = selectedText.match(/\s*$/)?.[0] ?? '';
  const trail = lead.length + trailMatch.length > selectedText.length ? '' : trailMatch;
  const core = selectedText.slice(lead.length, selectedText.length - trail.length);
  const newValue = value.slice(0, lo) + lead + marker + core + marker + trail + value.slice(hi);
  const selStart = lo + lead.length + marker.length;
  return finish(newValue, selStart, selStart + core.length);
}

export const toggleBold: MarkdownTransform = (sel) => toggleSurround(sel, '**', MARKDOWN_PLACEHOLDERS.bold);
export const toggleItalic: MarkdownTransform = (sel) => toggleSurround(sel, '_', MARKDOWN_PLACEHOLDERS.italic);
export const toggleStrikethrough: MarkdownTransform = (sel) => toggleSurround(sel, '~~', MARKDOWN_PLACEHOLDERS.strikethrough);
export const toggleInlineCode: MarkdownTransform = (sel) => toggleSurround(sel, '`', MARKDOWN_PLACEHOLDERS.inlineCode);

// ---- line-prefix families: headings, lists, blockquote ----
function lineStartOf(value: string, index: number): number {
  const idx = value.slice(0, index).lastIndexOf('\n');
  return idx === -1 ? 0 : idx + 1;
}

function lineEndOf(value: string, index: number): number {
  const idx = value.indexOf('\n', index);
  return idx === -1 ? value.length : idx;
}

interface LinePrefixSpec {
  /** Does this (indentation-stripped) line already carry the target prefix? */
  match: RegExp;
  /** Remove the target prefix from an already-matching line's content. */
  toggleOff: (content: string) => string;
  /** Sibling prefixes (this family) to strip before applying the target one. */
  replaces: RegExp[];
  /** Prefix text for the nth (0-based) non-blank affected line. */
  prefixFor: (index: number) => string;
  placeholder: string;
}

function toggleLinePrefix(selRaw: MarkdownSelection, spec: LinePrefixSpec): MarkdownSelection {
  const sel = stripCR(selRaw);
  const { value, lo, hi } = bounds(sel);

  if (value.length === 0) {
    const prefix = spec.prefixFor(0);
    const newValue = prefix + spec.placeholder;
    return finish(newValue, prefix.length, newValue.length);
  }

  const lineStart = lineStartOf(value, lo);
  const adjustedHi = hi > lo && value[hi - 1] === '\n' ? hi - 1 : hi;
  const lineEnd = lineEndOf(value, adjustedHi);

  const block = value.slice(lineStart, lineEnd);
  const lines = block.split('\n');
  const nonBlank = lines.map((l, i) => (l.trim() ? i : -1)).filter((i) => i >= 0);
  const allMatch =
    nonBlank.length > 0 &&
    nonBlank.every((i) => {
      const indent = lines[i].match(/^\s*/)?.[0] ?? '';
      return spec.match.test(lines[i].slice(indent.length));
    });

  let counter = 0;
  const resultLines = lines.map((line) => {
    if (!line.trim()) return line;
    const indent = line.match(/^\s*/)?.[0] ?? '';
    const content = line.slice(indent.length);
    if (allMatch) {
      return indent + spec.toggleOff(content);
    }
    let stripped = content;
    for (const re of spec.replaces) {
      if (re.test(stripped)) {
        stripped = stripped.replace(re, '');
        break;
      }
    }
    const prefix = spec.prefixFor(counter);
    counter += 1;
    return indent + prefix + stripped;
  });

  const newBlock = resultLines.join('\n');
  const newValue = value.slice(0, lineStart) + newBlock + value.slice(lineEnd);

  if (lo === hi) {
    const indent0 = lines[0].match(/^\s*/)?.[0] ?? '';
    const relPos = lo - lineStart;
    const delta = resultLines[0].length - lines[0].length;
    // A caret inside the untouched leading indentation should stay put; only a caret in the
    // line's content (after the indentation) shifts by the prefix insertion/removal delta.
    const caret = relPos <= indent0.length ? lo : lo + delta;
    return finish(newValue, caret, caret);
  }

  return finish(newValue, lineStart, lineStart + newBlock.length);
}

const HEADING_STRIP = /^#{1,6}\s+/;
function headingSpec(level: 1 | 2 | 3): LinePrefixSpec {
  const prefix = `${'#'.repeat(level)} `;
  const match = new RegExp(`^#{${level}}(?!#)\\s+`);
  return {
    match,
    toggleOff: (content) => content.replace(match, ''),
    replaces: [HEADING_STRIP],
    prefixFor: () => prefix,
    placeholder: MARKDOWN_PLACEHOLDERS.heading,
  };
}

const TASK_RE = /^-\s+\[[ xX]\]\s+/;
const NUMBERED_RE = /^\d+[.)]\s+/;
const BULLET_RE = /^-\s+(?!\[[ xX]\]\s)/;
const BLOCKQUOTE_RE = /^>\s?/;
const LIST_FAMILY = [TASK_RE, NUMBERED_RE, BULLET_RE];

const bulletListSpec: LinePrefixSpec = {
  match: BULLET_RE, toggleOff: (c) => c.replace(BULLET_RE, ''), replaces: LIST_FAMILY,
  prefixFor: () => '- ', placeholder: MARKDOWN_PLACEHOLDERS.bulletList,
};
const numberedListSpec: LinePrefixSpec = {
  match: NUMBERED_RE, toggleOff: (c) => c.replace(NUMBERED_RE, ''), replaces: LIST_FAMILY,
  prefixFor: (i) => `${i + 1}. `, placeholder: MARKDOWN_PLACEHOLDERS.numberedList,
};
const taskListSpec: LinePrefixSpec = {
  match: TASK_RE, toggleOff: (c) => c.replace(TASK_RE, '- '), replaces: LIST_FAMILY,
  prefixFor: () => '- [ ] ', placeholder: MARKDOWN_PLACEHOLDERS.taskList,
};
const blockquoteSpec: LinePrefixSpec = {
  match: BLOCKQUOTE_RE, toggleOff: (c) => c.replace(BLOCKQUOTE_RE, ''), replaces: [BLOCKQUOTE_RE],
  prefixFor: () => '> ', placeholder: MARKDOWN_PLACEHOLDERS.blockquote,
};

export const toggleHeading1: MarkdownTransform = (sel) => toggleLinePrefix(sel, headingSpec(1));
export const toggleHeading2: MarkdownTransform = (sel) => toggleLinePrefix(sel, headingSpec(2));
export const toggleHeading3: MarkdownTransform = (sel) => toggleLinePrefix(sel, headingSpec(3));
export const toggleBulletList: MarkdownTransform = (sel) => toggleLinePrefix(sel, bulletListSpec);
export const toggleNumberedList: MarkdownTransform = (sel) => toggleLinePrefix(sel, numberedListSpec);
export const toggleTaskList: MarkdownTransform = (sel) => toggleLinePrefix(sel, taskListSpec);
export const toggleBlockquote: MarkdownTransform = (sel) => toggleLinePrefix(sel, blockquoteSpec);

// ---- block inserts: code fence, table, horizontal rule ----
function leadingSeparator(before: string): string {
  const trimmedEnd = before.replace(/\n+$/, '');
  if (trimmedEnd.length === 0) return '';
  const existing = before.length - trimmedEnd.length;
  return '\n'.repeat(Math.max(0, 2 - existing));
}

function trailingSeparator(after: string): string {
  const trimmedStart = after.replace(/^\n+/, '');
  const desired = trimmedStart.length === 0 ? 1 : 2;
  const existing = after.length - trimmedStart.length;
  return '\n'.repeat(Math.max(0, desired - existing));
}

interface BlockInsertion {
  text: string;
  selStart: number;
  selEnd: number;
}

function insertBlock(selRaw: MarkdownSelection, build: (selectedText: string) => BlockInsertion): MarkdownSelection {
  const sel = stripCR(selRaw);
  const { value, lo, hi } = bounds(sel);
  const before = value.slice(0, lo);
  const after = value.slice(hi);
  const built = build(value.slice(lo, hi));
  const lead = leadingSeparator(before);
  const trail = trailingSeparator(after);
  const newValue = before + lead + built.text + trail + after;
  const blockStart = before.length + lead.length;
  return finish(newValue, blockStart + built.selStart, blockStart + built.selEnd);
}

export const toggleCodeBlock: MarkdownTransform = (selRaw) => {
  const sel = stripCR(selRaw);
  const { value, lo, hi } = bounds(sel);
  const selectedText = value.slice(lo, hi);
  const lines = selectedText.split('\n');

  if (lines.length >= 2 && lines[0].trim().startsWith('```') && lines[lines.length - 1].trim() === '```') {
    const inner = lines.slice(1, -1).join('\n');
    const newValue = value.slice(0, lo) + inner + value.slice(hi);
    return finish(newValue, lo, lo + inner.length);
  }

  return insertBlock(sel, (text) => {
    if (text.length === 0) {
      const lang = MARKDOWN_PLACEHOLDERS.codeBlock;
      return { text: `\`\`\`${lang}\n\n\`\`\``, selStart: 3, selEnd: 3 + lang.length };
    }
    const fenceOpen = '```\n';
    const blockText = `${fenceOpen}${text}\n\`\`\``;
    return { text: blockText, selStart: fenceOpen.length, selEnd: fenceOpen.length + text.length };
  });
};

const URL_SCHEME_RE = /^(https?:\/\/|mailto:)/i;

export const insertLink: MarkdownTransform = (selRaw) => {
  const sel = stripCR(selRaw);
  const { value, lo, hi } = bounds(sel);
  const selectedText = value.slice(lo, hi);

  let text: string, selStart: number, selEnd: number;

  if (selectedText.length === 0) {
    const label = MARKDOWN_PLACEHOLDERS.linkText;
    text = `[${label}](https://)`;
    selStart = 1;
    selEnd = 1 + label.length;
  } else if (URL_SCHEME_RE.test(selectedText) && !/\s/.test(selectedText)) {
    text = `[](${selectedText})`;
    selStart = 1;
    selEnd = 1;
  } else {
    const urlPlaceholder = MARKDOWN_PLACEHOLDERS.linkUrl;
    const label = selectedText.replace(/\]/g, '\\]');
    text = `[${label}](${urlPlaceholder})`;
    selStart = label.length + 3;
    selEnd = selStart + urlPlaceholder.length;
  }

  const newValue = value.slice(0, lo) + text + value.slice(hi);
  return finish(newValue, lo + selStart, lo + selEnd);
};

export const insertTable: MarkdownTransform = (sel) =>
  insertBlock(sel, () => {
    const col = MARKDOWN_PLACEHOLDERS.table;
    const text = `| ${col} | ${col} | ${col} |\n| --- | --- | --- |\n|  |  |  |`;
    return { text, selStart: 2, selEnd: 2 + col.length };
  });

export const insertHorizontalRule: MarkdownTransform = (sel) =>
  insertBlock(sel, () => ({ text: '---', selStart: 3, selEnd: 3 }));

// ---- Enter-to-continue lists / blockquotes ----
// Renumbers same-indent numbered-list lines after a mid-list Enter so no number is duplicated.
function renumberTail(tail: string, indent: string, start: number): string {
  const re = new RegExp(`^${indent}(\\d+)([.)]\\s+)`), lines = tail.split('\n');
  for (let i = 1, n = start; i < lines.length && re.test(lines[i]); i += 1, n += 1) lines[i] = lines[i].replace(re, `${indent}${n}$2`);
  return lines.join('\n');
}
export function continueListOnEnter(selRaw: MarkdownSelection): MarkdownSelection | null {
  if (selRaw.selectionStart !== selRaw.selectionEnd) return null;
  const sel = stripCR(selRaw);
  const { value, lo: pos } = bounds(sel);

  const lineStart = lineStartOf(value, pos);
  const lineEnd = lineEndOf(value, pos);
  const line = value.slice(lineStart, lineEnd);
  const indent = line.match(/^\s*/)?.[0] ?? '';
  const content = line.slice(indent.length);

  const taskMatch = content.match(TASK_RE);
  const numberedMatch = content.match(/^(\d+)([.)])\s+/);
  const bulletMatch = !taskMatch ? content.match(BULLET_RE) : null;
  const quoteMatch = content.match(BLOCKQUOTE_RE);

  let markerLen: number, continuation: string;
  if (taskMatch) {
    markerLen = taskMatch[0].length;
    continuation = '- [ ] ';
  } else if (numberedMatch) {
    markerLen = numberedMatch[0].length;
    continuation = `${parseInt(numberedMatch[1], 10) + 1}${numberedMatch[2]} `;
  } else if (bulletMatch) {
    markerLen = bulletMatch[0].length;
    continuation = '- ';
  } else if (quoteMatch) {
    markerLen = quoteMatch[0].length;
    continuation = '> ';
  } else {
    return null;
  }

  const isEmptyItem = content.slice(markerLen).trim().length === 0;

  if (isEmptyItem) {
    const hasNext = lineEnd < value.length; // value[lineEnd] is already a separator, unless last line
    const newValue = `${value.slice(0, lineStart)}${indent}${hasNext ? '' : '\n'}${value.slice(lineEnd)}`;
    const caret = lineStart + indent.length + (hasNext ? 0 : 1);
    return finish(newValue, caret, caret);
  }
  const tail = numberedMatch ? renumberTail(value.slice(pos), indent, parseInt(numberedMatch[1], 10) + 2) : value.slice(pos);
  const newValue = `${value.slice(0, pos)}\n${indent}${continuation}${tail}`;
  const caret = pos + 1 + indent.length + continuation.length;
  return finish(newValue, caret, caret);
}

export function previewMinHeight(minRows: number): string {
  const rows = Number.isFinite(minRows) ? Math.max(1, minRows) : 1;
  return `calc(${rows} * 1.4375em + 16px)`;
}
