import { describe, expect, it } from 'vitest';
import {
  insertHorizontalRule,
  insertLink,
  insertTable,
  toggleBlockquote,
  toggleBold,
  toggleBulletList,
  toggleCodeBlock,
  toggleInlineCode,
  toggleItalic,
  toggleNumberedList,
  toggleStrikethrough,
  toggleTaskList,
  type MarkdownSelection,
  type MarkdownTransform,
} from './markdownTransforms';

describe('toggleBulletList', () => {
  it('adds a bullet to a plain line', () => {
    const result = toggleBulletList({ value: 'item', selectionStart: 0, selectionEnd: 0 });
    expect(result.value).toBe('- item');
  });

  it('removes the bullet when toggled again', () => {
    const result = toggleBulletList({ value: '- item', selectionStart: 0, selectionEnd: 0 });
    expect(result.value).toBe('item');
  });

  it('applies to every non-blank line in a multi-line selection', () => {
    const value = 'one\ntwo\nthree';
    const result = toggleBulletList({ value, selectionStart: 0, selectionEnd: value.length });
    expect(result.value).toBe('- one\n- two\n- three');
  });

  it('keeps a collapsed caret sitting in the leading indentation near its original position', () => {
    const result = toggleBulletList({ value: '  text', selectionStart: 1, selectionEnd: 1 });
    expect(result.value).toBe('  - text');
    expect(result.selectionStart).toBe(1);
    expect(result.selectionEnd).toBe(1);
  });
});

describe('toggleNumberedList', () => {
  it('renumbers a multi-line selection from 1..N', () => {
    const value = 'a\nb\nc';
    const result = toggleNumberedList({ value, selectionStart: 0, selectionEnd: value.length });
    expect(result.value).toBe('1. a\n2. b\n3. c');
  });

  it('replaces a bullet marker rather than stacking it', () => {
    const result = toggleNumberedList({ value: '- item', selectionStart: 0, selectionEnd: 0 });
    expect(result.value).toBe('1. item');
  });

  it('toggles off, removing the numbering', () => {
    const value = '1. a\n2. b';
    const result = toggleNumberedList({ value, selectionStart: 0, selectionEnd: value.length });
    expect(result.value).toBe('a\nb');
  });
});

describe('toggleTaskList', () => {
  it('adds an unchecked task box to a plain line', () => {
    const result = toggleTaskList({ value: 'item', selectionStart: 0, selectionEnd: 0 });
    expect(result.value).toBe('- [ ] item');
  });

  it('toggling off a checked task line reverts to a plain bullet, not plain text', () => {
    const result = toggleTaskList({ value: '- [x] item', selectionStart: 0, selectionEnd: 0 });
    expect(result.value).toBe('- item');
  });

  it('toggling off an unchecked task line also reverts to a plain bullet', () => {
    const result = toggleTaskList({ value: '- [ ] item', selectionStart: 0, selectionEnd: 0 });
    expect(result.value).toBe('- item');
  });
});

describe('toggleBlockquote', () => {
  it('adds a quote marker to a plain line', () => {
    const result = toggleBlockquote({ value: 'quote me', selectionStart: 0, selectionEnd: 0 });
    expect(result.value).toBe('> quote me');
  });

  it('removes the quote marker when toggled again', () => {
    const result = toggleBlockquote({ value: '> quote me', selectionStart: 0, selectionEnd: 0 });
    expect(result.value).toBe('quote me');
  });

  it('preserves an existing list marker instead of stripping it', () => {
    const result = toggleBlockquote({ value: '- item', selectionStart: 0, selectionEnd: 0 });
    expect(result.value).toBe('> - item');
  });

  it('normalizes CRLF line endings and keeps the selection index remapped', () => {
    const value = 'first\r\nsecond';
    const result = toggleBlockquote({ value, selectionStart: 7, selectionEnd: 7 });
    expect(result.value).toBe('first\n> second');
    expect(result.value.includes('\r')).toBe(false);
  });

  it('applies to a mixed multi-line selection using per-line prefixes', () => {
    const value = '> already\nplain';
    const result = toggleBlockquote({ value, selectionStart: 0, selectionEnd: value.length });
    expect(result.value).toBe('> already\n> plain');
  });
});

describe('toggleCodeBlock', () => {
  it('wraps an empty selection with an empty fenced block and selects the language placeholder', () => {
    const result = toggleCodeBlock({ value: '', selectionStart: 0, selectionEnd: 0 });
    expect(result.value).toBe('```code\n\n```\n');
    expect(result.value.slice(result.selectionStart, result.selectionEnd)).toBe('code');
  });

  it('wraps selected text in a fenced code block, selecting only the wrapped text', () => {
    const result = toggleCodeBlock({ value: 'const x = 1;', selectionStart: 0, selectionEnd: 12 });
    expect(result.value).toBe('```\nconst x = 1;\n```\n');
    expect(result.value.slice(result.selectionStart, result.selectionEnd)).toBe('const x = 1;');
  });

  it('unwraps an already-fenced selection back to plain text', () => {
    const value = '```\nconst x = 1;\n```';
    const result = toggleCodeBlock({ value, selectionStart: 0, selectionEnd: value.length });
    expect(result.value).toBe('const x = 1;');
  });

  it('inserts a blank-line separator when text precedes the block', () => {
    const value = 'intro';
    const result = toggleCodeBlock({ value, selectionStart: value.length, selectionEnd: value.length });
    expect(result.value.startsWith('intro\n\n```')).toBe(true);
  });
});

describe('insertLink', () => {
  it('inserts placeholder text and url for a collapsed caret', () => {
    const result = insertLink({ value: '', selectionStart: 0, selectionEnd: 0 });
    expect(result.value).toBe('[text](https://)');
    expect(result.value.slice(result.selectionStart, result.selectionEnd)).toBe('text');
  });

  it('wraps selected plain text as the link label and selects the url placeholder', () => {
    const result = insertLink({ value: 'click here', selectionStart: 0, selectionEnd: 10 });
    expect(result.value).toBe('[click here](url)');
    expect(result.value.slice(result.selectionStart, result.selectionEnd)).toBe('url');
  });

  it('treats a selected http(s) url as the destination, leaving the label to fill in', () => {
    const result = insertLink({ value: 'https://example.com', selectionStart: 0, selectionEnd: 20 });
    expect(result.value).toBe('[](https://example.com)');
    expect(result.selectionStart).toBe(1);
    expect(result.selectionEnd).toBe(1);
  });

  it('treats a selected mailto: address as the destination', () => {
    const value = 'mailto:me@example.com';
    const result = insertLink({ value, selectionStart: 0, selectionEnd: value.length });
    expect(result.value).toBe(`[](${value})`);
  });

  it('treats a url followed by trailing prose as plain text, not a bare destination', () => {
    const value = 'https://example.com and see the docs';
    const result = insertLink({ value, selectionStart: 0, selectionEnd: value.length });
    expect(result.value).toBe(`[${value}](url)`);
  });

  it('escapes a `]` in the selected label so it cannot close the link early', () => {
    const value = 'click here]';
    const result = insertLink({ value, selectionStart: 0, selectionEnd: value.length });
    expect(result.value).toBe('[click here\\]](url)');
  });
});

describe('insertTable', () => {
  it('inserts a 3-column GFM table skeleton into an empty document', () => {
    const result = insertTable({ value: '', selectionStart: 0, selectionEnd: 0 });
    expect(result.value).toBe('| Column | Column | Column |\n| --- | --- | --- |\n|  |  |  |\n');
    expect(result.value.slice(result.selectionStart, result.selectionEnd)).toBe('Column');
  });
});

describe('insertHorizontalRule', () => {
  it('produces exactly "---\\n" in an empty document', () => {
    const result = insertHorizontalRule({ value: '', selectionStart: 0, selectionEnd: 0 });
    expect(result.value).toBe('---\n');
  });

  it('separates the rule from preceding text with a blank line', () => {
    const value = 'above';
    const result = insertHorizontalRule({ value, selectionStart: value.length, selectionEnd: value.length });
    expect(result.value).toBe('above\n\n---\n');
  });
});

describe('purity guard', () => {
  const transforms: Record<string, MarkdownTransform> = {
    toggleBold,
    toggleItalic,
    toggleStrikethrough,
    toggleInlineCode,
    toggleBulletList,
    toggleNumberedList,
    toggleTaskList,
    toggleBlockquote,
    toggleCodeBlock,
    insertLink,
    insertTable,
    insertHorizontalRule,
  };

  const samples: MarkdownSelection[] = [
    { value: '', selectionStart: 0, selectionEnd: 0 },
    { value: 'hello world', selectionStart: 0, selectionEnd: 5 },
    { value: '- [ ] task\n> quote', selectionStart: 3, selectionEnd: 15 },
  ];

  for (const [name, fn] of Object.entries(transforms)) {
    it(`${name} never mutates its input and always returns clamped offsets`, () => {
      for (const sample of samples) {
        const frozen = Object.freeze({ ...sample });
        const before = { ...frozen };
        const result = fn(frozen);
        expect(frozen).toEqual(before);
        expect(result.selectionStart).toBeGreaterThanOrEqual(0);
        expect(result.selectionEnd).toBeGreaterThanOrEqual(0);
        expect(result.selectionStart).toBeLessThanOrEqual(result.value.length);
        expect(result.selectionEnd).toBeLessThanOrEqual(result.value.length);
      }
    });
  }

  it('never throws for wildly out-of-range or reversed selections', () => {
    const weird: MarkdownSelection[] = [
      { value: 'abc', selectionStart: 999, selectionEnd: -999 },
      { value: 'abc', selectionStart: NaN, selectionEnd: NaN },
    ];
    for (const fn of Object.values(transforms)) {
      for (const sample of weird) {
        expect(() => fn(sample)).not.toThrow();
      }
    }
  });
});
