import { describe, expect, it } from 'vitest';
import {
  appendMentionTokens,
  filterMentionFiles,
  getMentionQueryAtEnd,
  hasPendingMention,
  removeMentionQuery,
  type PendingMention,
} from './mentionComposer';

function pending(kind: PendingMention['kind'], path?: string): PendingMention {
  return { id: `${kind}:${path ?? 'diff'}`, kind, path };
}

describe('getMentionQueryAtEnd', () => {
  it('matches an @ token at the end of the draft', () => {
    expect(getMentionQueryAtEnd('look at @src/ap')).toEqual({ query: 'src/ap', start: 8 });
    expect(getMentionQueryAtEnd('@')).toEqual({ query: '', start: 0 });
  });

  it('ignores drafts without a trailing @ token', () => {
    expect(getMentionQueryAtEnd('no mention here')).toBeNull();
    expect(getMentionQueryAtEnd('@done already ')).toBeNull();
    expect(getMentionQueryAtEnd('email me@example')).toBeNull();
  });
});

describe('removeMentionQuery', () => {
  it('strips the active token and surrounding whitespace', () => {
    const draft = 'check @src/app';
    const match = getMentionQueryAtEnd(draft);
    if (!match) throw new Error('expected a mention match');
    expect(removeMentionQuery(draft, match)).toBe('check');
  });

  it('handles a draft that is only the token', () => {
    const match = getMentionQueryAtEnd('@query');
    if (!match) throw new Error('expected a mention match');
    expect(removeMentionQuery('@query', match)).toBe('');
  });
});

describe('filterMentionFiles', () => {
  const files = ['src/app.ts', 'src/utils/format.ts', 'README.md'];

  it('returns all files for an empty query', () => {
    expect(filterMentionFiles(files, '')).toEqual(files);
  });

  it('matches substrings and basename prefixes case-insensitively', () => {
    expect(filterMentionFiles(files, 'FORMAT')).toEqual(['src/utils/format.ts']);
    expect(filterMentionFiles(files, 'read')).toEqual(['README.md']);
  });

  it('caps the number of results', () => {
    const many = Array.from({ length: 20 }, (_, i) => `file-${i}.ts`);
    expect(filterMentionFiles(many, '', 5)).toHaveLength(5);
  });
});

describe('hasPendingMention', () => {
  it('deduplicates by kind and path', () => {
    const mentions = [pending('file', 'a.ts'), pending('diff')];
    expect(hasPendingMention(mentions, { kind: 'file', path: 'a.ts' })).toBe(true);
    expect(hasPendingMention(mentions, { kind: 'diff' })).toBe(true);
    expect(hasPendingMention(mentions, { kind: 'file', path: 'b.ts' })).toBe(false);
  });
});

describe('appendMentionTokens', () => {
  it('appends formatted tokens after the trimmed text', () => {
    const mentions = [pending('file', 'src/app.ts'), pending('diff')];
    expect(appendMentionTokens('review this ', mentions)).toBe('review this @src/app.ts @diff');
  });

  it('returns only tokens when the text is empty', () => {
    expect(appendMentionTokens('   ', [pending('diff')])).toBe('@diff');
  });

  it('returns trimmed text when there are no mentions', () => {
    expect(appendMentionTokens('  hello  ', [])).toBe('hello');
  });
});
