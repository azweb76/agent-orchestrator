import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildInstructionDraftPrompt, parseInstructionDraftResponse } from './instruction-draft.js';

test('parseInstructionDraftResponse reads fenced JSON and fills skill path', () => {
  const raw = `\`\`\`json
{
  "name": "api-testing",
  "description": "Run API tests",
  "content": "---\\nname: api-testing\\ndescription: Run API tests\\n---\\n# API testing\\n",
  "rationale": "The session kept skipping tests."
}
\`\`\``;
  const draft = parseInstructionDraftResponse(raw, { kind: 'skill', scope: 'project' }, false);
  assert.equal(draft.kind, 'skill');
  assert.equal(draft.action, 'create');
  assert.equal(draft.name, 'api-testing');
  assert.equal(draft.relativePath, '.claude/skills/api-testing/SKILL.md');
  assert.match(draft.content, /API testing/);
  assert.match(draft.rationale, /skipping tests/);
});

test('parseInstructionDraftResponse keeps CLAUDE.md as the target path', () => {
  const raw = JSON.stringify({
    name: 'ignored',
    description: 'Project instructions',
    content: '# CLAUDE.md\nAlways run tests.',
    rationale: 'Missed tests.',
  });
  const draft = parseInstructionDraftResponse(raw, { kind: 'claude_md', relativePath: 'CLAUDE.md' }, true);
  assert.equal(draft.kind, 'claude_md');
  assert.equal(draft.action, 'update');
  assert.equal(draft.relativePath, 'CLAUDE.md');
  assert.equal(draft.scope, 'project');
});

test('parseInstructionDraftResponse rejects missing content', () => {
  assert.throws(
    () => parseInstructionDraftResponse('{"name":"x"}', { kind: 'skill' }, false),
    /missing file content/,
  );
});

test('buildInstructionDraftPrompt includes grade and transcript', () => {
  const { system, user } = buildInstructionDraftPrompt({
    transcript: 'user: do the thing',
    score: 2,
    comment: 'Skipped tests',
    request: { kind: 'skill', extraNotes: 'Always run pnpm test' },
  });
  assert.match(system, /JSON object/);
  assert.match(user, /2\/5/);
  assert.match(user, /Skipped tests/);
  assert.match(user, /pnpm test/);
  assert.match(user, /user: do the thing/);
});
