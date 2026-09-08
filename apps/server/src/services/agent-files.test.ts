import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { findAgentFiles } from './agent-files.js';

describe('agent-files', () => {
  it('finds Claude agent markdown and prefers .claude/agents', () => {
    const files = findAgentFiles([
      '.claude/agents/code-reviewer.md',
      'agents/code-reviewer.md',
      'agents/research.md',
      '.claude/agents/../escape.md',
      'README.md',
      '.claude/agents/nested/skip.md',
    ]);
    assert.deepEqual(
      files.map((file) => file.slug),
      ['code-reviewer', 'research'],
    );
    assert.equal(
      files.find((file) => file.slug === 'code-reviewer')?.relativePath,
      '.claude/agents/code-reviewer.md',
    );
    assert.equal(files.find((file) => file.slug === 'research')?.relativePath, 'agents/research.md');
  });
});
