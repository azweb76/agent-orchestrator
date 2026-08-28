import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  ClaudeService,
  enrichPermissionInput,
  isPidAlive,
  killProcessTree,
  slugify,
} from './git.js';
import { waitFor, writeFakeClaude } from './git.test-helpers.js';

test('killProcessTree terminates process groups started detached', async () => {
  const child = spawn(
    process.execPath,
    [
      '-e',
      'setInterval(() => {}, 1000);',
    ],
    { detached: true, stdio: 'ignore' },
  );
  child.unref();
  assert.ok(child.pid);
  assert.equal(isPidAlive(child.pid), true);
  killProcessTree(child.pid);
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(isPidAlive(child.pid), false);
});

test('slugify turns a PR head ref into a worktree-safe name', () => {
  assert.equal(slugify('feature/dark-mode'), 'feature-dark-mode');
  assert.equal(slugify('cursor/from-pr-worktree-branch-name-3bcb'), 'cursor-from-pr-worktree-branch-name-3bcb');
});

test('enrichPermissionInput loads ExitPlanMode plan text from disk when input is empty', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'exit-plan-'));
  const plansDir = path.join(tmp, '.claude', 'plans');
  await fs.mkdir(plansDir, { recursive: true });
  const planFile = path.join(plansDir, 'bold-eagle.md');
  await fs.writeFile(planFile, '# Do the thing\n\n1. Ship it.\n');

  const logPath = path.join(tmp, 'run.log');
  await fs.writeFile(
    logPath,
    `${JSON.stringify({
      type: 'assistant',
      message: {
        content: [{ type: 'tool_use', name: 'Write', input: { file_path: planFile } }],
      },
    })}\n`,
  );

  const enriched = enrichPermissionInput('ExitPlanMode', {}, { logPath, plansDir });
  assert.equal(enriched.plan, '# Do the thing\n\n1. Ship it.');
  assert.equal(enriched.planFilePath, planFile);

  const fromRecent = enrichPermissionInput('ExitPlanMode', {}, { plansDir });
  assert.equal(fromRecent.plan, '# Do the thing\n\n1. Ship it.');

  await fs.rm(tmp, { recursive: true, force: true });
});

test('stopping a hung ExitPlanMode run does not untrack a replacement process', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-replace-'));
  const binPath = path.join(tmp, 'fake-claude');
  const runsDir = path.join(tmp, 'runs');

  await writeFakeClaude(
    binPath,
    `#!/usr/bin/env node
process.stdout.write(JSON.stringify({
  type: 'control_request',
  request_id: 'req-exit',
  request: { subtype: 'can_use_tool', tool_name: 'ExitPlanMode', input: {} },
}) + '\\n');
setInterval(() => {}, 1000);
`,
  );

  const service = new ClaudeService(binPath, runsDir);
  const firstRequests: string[] = [];
  const first = service.runStreaming('agent-plan', {
    cwd: tmp,
    prompt: 'plan',
    onPermissionRequest: (request) => firstRequests.push(request.toolName),
  });

  await waitFor(() => firstRequests.length === 1 && firstRequests[0] === 'ExitPlanMode');
  assert.deepEqual(firstRequests, ['ExitPlanMode']);
  const firstPid = service.getRunningProcess('agent-plan')?.pid;
  assert.ok(firstPid);

  service.stop('agent-plan', firstPid);

  const second = service.runStreaming('agent-plan', {
    cwd: tmp,
    prompt: 'implement',
  });
  const secondTracked = service.getRunningProcess('agent-plan');
  assert.ok(secondTracked);
  assert.notEqual(secondTracked.pid, firstPid);

  await first.catch(() => undefined);
  const after = service.getRunningProcess('agent-plan');
  assert.ok(after, 'replacement run must stay tracked after the stopped monitor exits');
  assert.equal(after.pid, secondTracked.pid);

  service.stop('agent-plan');
  await second.catch(() => undefined);
  await fs.rm(tmp, { recursive: true, force: true });
});
