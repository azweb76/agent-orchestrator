import { describe, expect, it } from 'vitest';
import {
  continueListOnEnter,
  previewMinHeight,
  toggleBold,
  toggleItalic,
  toggleStrikethrough,
  toggleInlineCode,
  toggleHeading1,
  toggleHeading2,
  toggleHeading3,
} from './markdownTransforms';

const CASES = [
  { name: 'bold', fn: toggleBold, marker: '**', placeholder: 'bold text' },
  { name: 'strikethrough', fn: toggleStrikethrough, marker: '~~', placeholder: 'strikethrough text' },
  { name: 'inlineCode', fn: toggleInlineCode, marker: '`', placeholder: 'code' },
];

describe.each(CASES)('$name (surround marker)', ({ fn, marker, placeholder }) => {
  it('wraps a collapsed caret with the marker and placeholder, selecting the placeholder', () => {
    const result = fn({ value: 'hi', selectionStart: 2, selectionEnd: 2 });
    expect(result.value).toBe(`hi${marker}${placeholder}${marker}`);
    expect(result.selectionStart).toBe(2 + marker.length);
    expect(result.selectionEnd).toBe(2 + marker.length + placeholder.length);
  });

  it('unwraps a collapsed caret sitting directly between an empty marker pair', () => {
    const value = `${marker}${marker}`;
    const caret = marker.length;
    const result = fn({ value, selectionStart: caret, selectionEnd: caret });
    expect(result.value).toBe('');
    expect(result.selectionStart).toBe(0);
    expect(result.selectionEnd).toBe(0);
  });

  it('wraps a selected range, selecting the core text inside the markers', () => {
    const result = fn({ value: 'hello world', selectionStart: 6, selectionEnd: 11 });
    expect(result.value).toBe(`hello ${marker}world${marker}`);
    expect(result.selectionStart).toBe(6 + marker.length);
    expect(result.selectionEnd).toBe(6 + marker.length + 5);
  });

  it('unwraps when the selection covers the markers plus inner text', () => {
    const wrapped = `${marker}world${marker}`;
    const result = fn({ value: `hello ${wrapped}`, selectionStart: 6, selectionEnd: 6 + wrapped.length });
    expect(result.value).toBe('hello world');
    expect(result.selectionStart).toBe(6);
    expect(result.selectionEnd).toBe(11);
  });

  it('unwraps when markers sit immediately outside an inner-text-only selection', () => {
    const value = `${marker}world${marker}`;
    const result = fn({ value, selectionStart: marker.length, selectionEnd: marker.length + 5 });
    expect(result.value).toBe('world');
    expect(result.selectionStart).toBe(0);
    expect(result.selectionEnd).toBe(5);
  });

  it('pushes leading/trailing whitespace outside the markers when wrapping', () => {
    const result = fn({ value: 'foo bar ', selectionStart: 0, selectionEnd: 8 });
    expect(result.value).toBe(`${marker}foo bar${marker} `);
  });

  it('never throws and clamps offsets for out-of-range input', () => {
    expect(() => fn({ value: 'abc', selectionStart: -5, selectionEnd: 999 })).not.toThrow();
    const result = fn({ value: 'abc', selectionStart: -5, selectionEnd: 999 });
    expect(result.selectionStart).toBeGreaterThanOrEqual(0);
    expect(result.selectionEnd).toBeLessThanOrEqual(result.value.length);
  });
});

describe('toggleItalic', () => {
  it('wraps a collapsed caret with a single underscore placeholder pair', () => {
    const result = toggleItalic({ value: 'hi', selectionStart: 2, selectionEnd: 2 });
    expect(result.value).toBe('hi_italic text_');
  });

  it('does not misfire as an unwrap when applied inside a bold-wrapped run', () => {
    const value = '__bold__';
    // Selection covers just "bold", inside the double-underscore bold markers.
    const result = toggleItalic({ value, selectionStart: 2, selectionEnd: 6 });
    expect(result.value).toBe('___bold___');
  });

  it('toggles italic off when a single underscore immediately surrounds the selection', () => {
    const result = toggleItalic({ value: '_word_', selectionStart: 1, selectionEnd: 5 });
    expect(result.value).toBe('word');
  });
});

const HEADINGS = [
  { name: 'toggleHeading1', fn: toggleHeading1, prefix: '# ' },
  { name: 'toggleHeading2', fn: toggleHeading2, prefix: '## ' },
  { name: 'toggleHeading3', fn: toggleHeading3, prefix: '### ' },
];

describe.each(HEADINGS)('$name', ({ fn, prefix }) => {
  it('adds the heading prefix to a plain line', () => {
    const result = fn({ value: 'Title', selectionStart: 0, selectionEnd: 0 });
    expect(result.value).toBe(`${prefix}Title`);
  });

  it('removes the heading prefix when the line already has it (toggle off)', () => {
    const value = `${prefix}Title`;
    const result = fn({ value, selectionStart: prefix.length, selectionEnd: prefix.length });
    expect(result.value).toBe('Title');
  });

  it('replaces a different heading level rather than stacking prefixes', () => {
    const result = fn({ value: '##### Title', selectionStart: 0, selectionEnd: 0 });
    expect(result.value).toBe(`${prefix}Title`);
    expect(result.value.startsWith('######')).toBe(false);
  });

  it('inserts a placeholder heading into an empty document', () => {
    const result = fn({ value: '', selectionStart: 0, selectionEnd: 0 });
    expect(result.value).toBe(`${prefix}Heading`);
    expect(result.selectionStart).toBe(prefix.length);
    expect(result.selectionEnd).toBe(result.value.length);
  });
});

describe('continueListOnEnter', () => {
  it('returns null for a non-list, non-quote line', () => {
    expect(continueListOnEnter({ value: 'plain text', selectionStart: 4, selectionEnd: 4 })).toBeNull();
  });

  it('returns null when the selection is not collapsed', () => {
    expect(continueListOnEnter({ value: '- item', selectionStart: 0, selectionEnd: 3 })).toBeNull();
  });

  it('continues a bullet list item, preserving indentation', () => {
    const value = '  - first';
    const result = continueListOnEnter({ value, selectionStart: value.length, selectionEnd: value.length });
    expect(result?.value).toBe('  - first\n  - ');
  });

  it('continues a numbered list item, incrementing the number', () => {
    const value = '3. third';
    const result = continueListOnEnter({ value, selectionStart: value.length, selectionEnd: value.length });
    expect(result?.value).toBe('3. third\n4. ');
  });

  it('continues a task list item with a fresh unchecked box', () => {
    const value = '- [x] done';
    const result = continueListOnEnter({ value, selectionStart: value.length, selectionEnd: value.length });
    expect(result?.value).toBe('- [x] done\n- [ ] ');
  });

  it('continues a blockquote line', () => {
    const value = '> quoted';
    const result = continueListOnEnter({ value, selectionStart: value.length, selectionEnd: value.length });
    expect(result?.value).toBe('> quoted\n> ');
  });

  it('removes the marker instead of continuing when the list item is empty', () => {
    const value = '- ';
    const result = continueListOnEnter({ value, selectionStart: value.length, selectionEnd: value.length });
    expect(result?.value).toBe('\n');
    expect(result?.selectionStart).toBe(1);
  });

  it('exits an empty list item mid-document without inserting a duplicate blank line', () => {
    const value = '- a\n- \nnext';
    const caret = 6;
    const result = continueListOnEnter({ value, selectionStart: caret, selectionEnd: caret });
    expect(result?.value).toBe('- a\n\nnext');
  });

  it('renumbers subsequent numbered items so no number is duplicated', () => {
    const value = '1. a\n2. b\n3. c';
    const result = continueListOnEnter({ value, selectionStart: 4, selectionEnd: 4 });
    expect(result?.value).toBe('1. a\n2. \n3. b\n4. c');
  });
});

describe('previewMinHeight', () => {
  it('computes a calc() expression from the row count', () => {
    expect(previewMinHeight(6)).toBe('calc(6 * 1.4375em + 16px)');
  });

  it('clamps rows below 1 up to 1', () => {
    expect(previewMinHeight(0)).toBe('calc(1 * 1.4375em + 16px)');
    expect(previewMinHeight(-3)).toBe('calc(1 * 1.4375em + 16px)');
  });

  it('handles non-finite input by falling back to 1', () => {
    expect(previewMinHeight(Number.NaN)).toBe('calc(1 * 1.4375em + 16px)');
  });
});
