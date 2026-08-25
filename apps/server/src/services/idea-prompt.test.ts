import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildIdeaKickoffPrompt } from '@agent-orchestrator/shared';

test('buildIdeaKickoffPrompt returns the trimmed idea with no appended instructions', () => {
  const prompt = buildIdeaKickoffPrompt('  Add dark mode  ');
  assert.equal(prompt, 'Add dark mode');
  assert.ok(!prompt.includes('AskUserQuestion'));
  assert.ok(!prompt.includes('ExitPlanMode'));
});

test('buildIdeaKickoffPrompt trims whitespace-only ideas to empty string', () => {
  const prompt = buildIdeaKickoffPrompt('   \n  ');
  assert.equal(prompt, '');
});
