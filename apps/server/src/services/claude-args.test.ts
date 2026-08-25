import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildClaudeArgs,
  buildPromptWithImages,
  buildStreamUserMessage,
  DEFAULT_ALLOWED_TOOLS,
  INTERACTIVE_TOOLS,
} from './git.js';
import {
  allowedToolsForPermissionMode,
  shouldAutoAllowToolPermission,
} from './permission-protocol.js';

test('buildPromptWithImages appends image paths for the Read tool', () => {
  const prompt = buildPromptWithImages('Fix this UI', ['/tmp/a.png', '/tmp/b.jpg']);
  assert.match(prompt, /Fix this UI/);
  assert.match(prompt, /\/tmp\/a\.png/);
  assert.match(prompt, /\/tmp\/b\.jpg/);
  assert.match(prompt, /Read tool/);
});

test('buildClaudeArgs enables stdio permission prompts and interactive tools', () => {
  const args = buildClaudeArgs({
    permissionMode: 'plan',
    model: 'sonnet',
  });
  assert.ok(!args.includes('-p'));
  assert.ok(args.includes('--permission-prompt-tool'));
  assert.equal(args[args.indexOf('--permission-prompt-tool') + 1], 'stdio');
  assert.ok(args.includes('--input-format'));
  assert.equal(args[args.indexOf('--input-format') + 1], 'stream-json');
  assert.ok(args.includes('--permission-mode'));
  assert.equal(args[args.indexOf('--permission-mode') + 1], 'plan');

  // Interactive tools must remain available (default tool set) but never
  // appear in --allowedTools, or Claude auto-approves them without the UI.
  assert.ok(!args.includes('--tools'));
  assert.match(INTERACTIVE_TOOLS, /AskUserQuestion/);
  assert.match(INTERACTIVE_TOOLS, /ExitPlanMode/);

  const allowed = args[args.indexOf('--allowedTools') + 1];
  assert.ok(!String(allowed).includes('AskUserQuestion'));
  assert.ok(!String(allowed).includes('ExitPlanMode'));
  assert.equal(DEFAULT_ALLOWED_TOOLS.includes('AskUserQuestion'), false);
  assert.equal(allowed, allowedToolsForPermissionMode('plan'));
});

test('buildClaudeArgs passes permission-mode for bypass without dangerously-skip', () => {
  const args = buildClaudeArgs({
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
  const allowed = args[args.indexOf('--allowedTools') + 1];
  assert.match(String(allowed), /Bash/);
  assert.ok(!String(allowed).includes('AskUserQuestion'));
});

test('buildClaudeArgs passes permission-mode for non-bypass modes', () => {
  const args = buildClaudeArgs({
    permissionMode: 'plan',
  });
  assert.ok(!args.includes('--dangerously-skip-permissions'));
  const modeIdx = args.indexOf('--permission-mode');
  assert.ok(modeIdx >= 0);
  assert.equal(args[modeIdx + 1], 'plan');
});

test('buildStreamUserMessage wraps the prompt as stream-json', () => {
  const line = buildStreamUserMessage('hello');
  assert.ok(line.endsWith('\n'));
  const parsed = JSON.parse(line.trim()) as {
    type: string;
    message: { role: string; content: string };
  };
  assert.equal(parsed.type, 'user');
  assert.equal(parsed.message.role, 'user');
  assert.equal(parsed.message.content, 'hello');
});

test('allowedToolsForPermissionMode never auto-approves interactive tools', () => {
  for (const mode of [
    'default',
    'acceptEdits',
    'plan',
    'auto',
    'dontAsk',
    'bypassPermissions',
  ]) {
    const tools = allowedToolsForPermissionMode(mode);
    assert.ok(!tools.includes('AskUserQuestion'), mode);
    assert.ok(!tools.includes('ExitPlanMode'), mode);
  }
  assert.equal(allowedToolsForPermissionMode('plan'), 'Read,Glob,Grep');
  assert.match(allowedToolsForPermissionMode('acceptEdits'), /Edit/);
  assert.match(allowedToolsForPermissionMode('auto'), /Bash/);
});

test('shouldAutoAllowToolPermission keeps interactive tools on the UI', () => {
  assert.equal(shouldAutoAllowToolPermission('AskUserQuestion', 'auto'), false);
  assert.equal(shouldAutoAllowToolPermission('ExitPlanMode', 'bypassPermissions'), false);
  assert.equal(shouldAutoAllowToolPermission('Bash', 'plan'), false);
  assert.equal(shouldAutoAllowToolPermission('Bash', 'default'), false);
  assert.equal(shouldAutoAllowToolPermission('Bash', 'auto'), true);
  assert.equal(shouldAutoAllowToolPermission('Edit', 'bypassPermissions'), true);
});
