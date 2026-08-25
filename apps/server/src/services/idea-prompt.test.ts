import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildIdeaKickoffPrompt } from '@agent-orchestrator/shared';

test('buildIdeaKickoffPrompt keeps the idea and requires clarifying questions before planning', () => {
  const prompt = buildIdeaKickoffPrompt('  Add dark mode  ');
  assert.match(prompt, /^Add dark mode\n/);
  assert.match(prompt, /AskUserQuestion/);
  assert.match(prompt, /ExitPlanMode/);
  assert.match(prompt, /until I have answered/);
});

test('buildIdeaKickoffPrompt trims whitespace-only ideas to empty lead-in', () => {
  const prompt = buildIdeaKickoffPrompt('   \n  ');
  assert.ok(prompt.startsWith('\n'));
  assert.match(prompt, /AskUserQuestion/);
});
