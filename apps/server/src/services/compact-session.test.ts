import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildCompactContinuePrompt,
  hasCrossedCompactThreshold,
  isContextUsageHot,
} from '@agent-orchestrator/shared';
import {
  buildCompactSummaryPrompt,
  collectCompactFilePaths,
  parseCompactSummaryResponse,
} from './compact-session.js';

test('buildCompactSummaryPrompt includes the session title and transcript', () => {
  const { system, user } = buildCompactSummaryPrompt({
    title: 'Fix login flow',
    transcript: 'user: fix the login bug\n\nassistant: patched auth.ts',
  });
  assert.match(system, /continuation summaries/);
  assert.match(user, /Session title: Fix login flow/);
  assert.match(user, /patched auth\.ts/);
});

test('parseCompactSummaryResponse trims and unwraps a fenced reply', () => {
  assert.equal(parseCompactSummaryResponse('  A summary.  '), 'A summary.');
  assert.equal(
    parseCompactSummaryResponse('```markdown\n## Goal\n\nShip it.\n```'),
    '## Goal\n\nShip it.',
  );
});

test('parseCompactSummaryResponse throws on empty output', () => {
  assert.throws(() => parseCompactSummaryResponse('   '), /empty summary/);
  assert.throws(() => parseCompactSummaryResponse(undefined), /empty summary/);
});

test('collectCompactFilePaths merges log tool paths with paths mentioned in chat', () => {
  const logText = [
    JSON.stringify({ type: 'assistant', tool: { file_path: 'src/edited.ts' } }),
    JSON.stringify({ type: 'assistant', tool: { file_path: 'src/edited.ts' } }),
  ].join('\n');
  const paths = collectCompactFilePaths(logText, [
    'Please update src/mentioned.ts and `docs/notes.md` next.',
  ]);
  assert.deepEqual(paths, ['docs/notes.md', 'src/edited.ts', 'src/mentioned.ts']);
});

test('buildCompactContinuePrompt seeds the summary and files in play', () => {
  const prompt = buildCompactContinuePrompt('Prior work summary.', ['src/a.ts', 'src/b.ts']);
  assert.match(prompt, /## Session summary/);
  assert.match(prompt, /Prior work summary\./);
  assert.match(prompt, /## Files in play/);
  assert.match(prompt, /- src\/a\.ts/);
  assert.match(prompt, /- src\/b\.ts/);
});

test('buildCompactContinuePrompt omits the file section when nothing is in play', () => {
  const prompt = buildCompactContinuePrompt('Just the summary.');
  assert.doesNotMatch(prompt, /## Files in play/);
});

test('threshold predicates flag crossed and hot usage', () => {
  assert.equal(
    hasCrossedCompactThreshold({ currentContextTokens: 167_000, compactThresholdTokens: 167_000 }),
    true,
  );
  assert.equal(
    hasCrossedCompactThreshold({ currentContextTokens: 100_000, compactThresholdTokens: 167_000 }),
    false,
  );
  assert.equal(
    hasCrossedCompactThreshold({ currentContextTokens: 0, compactThresholdTokens: 167_000 }),
    false,
  );
  assert.equal(isContextUsageHot({ percent: 85 }), true);
  assert.equal(isContextUsageHot({ percent: 60 }), false);
  assert.equal(isContextUsageHot({ percent: null }), false);
});
