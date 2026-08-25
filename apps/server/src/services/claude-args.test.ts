import assert from 'node:assert/strict';
import test from 'node:test';
import { buildClaudeArgs, buildPromptWithImages, DEFAULT_ALLOWED_TOOLS } from './git.js';

test('buildPromptWithImages appends image paths for the Read tool', () => {
  const prompt = buildPromptWithImages('Fix this UI', ['/tmp/a.png', '/tmp/b.jpg']);
  assert.match(prompt, /Fix this UI/);
  assert.match(prompt, /\/tmp\/a\.png/);
  assert.match(prompt, /\/tmp\/b\.jpg/);
  assert.match(prompt, /Read tool/);
});

test('buildClaudeArgs enables stdio permission prompts and interactive tools', () => {
  const args = buildClaudeArgs({
    prompt: 'hi',
    permissionMode: 'plan',
    model: 'sonnet',
  });
  assert.ok(args.includes('--permission-prompt-tool'));
  assert.equal(args[args.indexOf('--permission-prompt-tool') + 1], 'stdio');
  assert.ok(args.includes('--input-format'));
  assert.equal(args[args.indexOf('--input-format') + 1], 'stream-json');
  assert.ok(args.includes('--permission-mode'));
  assert.equal(args[args.indexOf('--permission-mode') + 1], 'plan');
  const tools = args[args.indexOf('--allowedTools') + 1];
  assert.match(String(tools), /AskUserQuestion/);
  assert.match(String(tools), /ExitPlanMode/);
  assert.equal(DEFAULT_ALLOWED_TOOLS.includes('AskUserQuestion'), true);
});

test('buildClaudeArgs passes permission-mode for bypass without dangerously-skip', () => {
  const args = buildClaudeArgs({
    prompt: 'hi',
    permissionMode: 'bypassPermissions',
    model: 'sonnet',
  });
  assert.ok(!args.includes('--dangerously-skip-permissions'));
  assert.ok(args.includes('--permission-mode'));
  assert.equal(args[args.indexOf('--permission-mode') + 1], 'bypassPermissions');
  assert.deepEqual(args.slice(args.indexOf('--model'), args.indexOf('--model') + 2), [
    '--model',
    'sonnet',
  ]);
});

test('buildClaudeArgs passes permission-mode for non-bypass modes', () => {
  const args = buildClaudeArgs({
    prompt: 'plan this',
    permissionMode: 'plan',
    imagePaths: ['/data/shot.png'],
  });
  assert.ok(!args.includes('--dangerously-skip-permissions'));
  const modeIdx = args.indexOf('--permission-mode');
  assert.ok(modeIdx >= 0);
  assert.equal(args[modeIdx + 1], 'plan');
  assert.match(args[1]!, /\/data\/shot\.png/);
});
