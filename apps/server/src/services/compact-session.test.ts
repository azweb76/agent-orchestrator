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
  parseCompactLearnResponse,
  parseCompactSummaryResponse,
} from './compact-session.js';

test('buildCompactSummaryPrompt includes the session title and transcript', () => {
  const { system, user } = buildCompactSummaryPrompt({
    title: 'Fix login flow',
    transcript: 'user: fix the login bug\n\nassistant: patched auth.ts',
  });
    assert.match(system, /Durable lessons/);
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

test('parseCompactLearnResponse splits durable lessons from the summary', () => {
  const parsed = parseCompactLearnResponse(`## Goal

Ship login.

## Durable lessons
- Prefer /fix-ci instead of exploring the whole repo
- Do not re-read auth.ts after the first pass
`);
  assert.match(parsed.summary, /Ship login/);
  assert.doesNotMatch(parsed.summary, /Durable lessons/);
  assert.deepEqual(parsed.lessons, [
    'Prefer /fix-ci instead of exploring the whole repo',
    'Do not re-read auth.ts after the first pass',
  ]);
});

test('buildCompactContinuePrompt includes durable lessons when present', () => {
  const prompt = buildCompactContinuePrompt('Prior work summary.', [], ['Use /plan-work first']);
  assert.match(prompt, /## Durable lessons/);
  assert.match(prompt, /Use \/plan-work first/);
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
