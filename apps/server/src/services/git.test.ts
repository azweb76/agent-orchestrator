import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import {
  ClaudeService,
  GitService,
  enrichPermissionInput,
  isPidAlive,
  killProcessTree,
  slugify,
} from './git.js';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function writeFakeClaude(binPath: string, script: string): Promise<void> {
  await fs.writeFile(binPath, script, { mode: 0o755 });
}

test('detached Claude run survives releaseAll (app shutdown) and can be reattached', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-detach-'));
  const binPath = path.join(tmp, 'fake-claude');
  const runsDir = path.join(tmp, 'runs');

  // Emits stream-json over a few hundred ms so we can "shut down" mid-run.
  await writeFakeClaude(
    binPath,
    `#!/usr/bin/env node
const session = 'sess-detach-1';
process.stdout.write(JSON.stringify({ type: 'system', session_id: session }) + '\\n');
setTimeout(() => {
  process.stdout.write(JSON.stringify({
    type: 'stream_event',
    event: { delta: { type: 'text_delta', text: 'hello ' } },
  }) + '\\n');
}, 150);
setTimeout(() => {
  process.stdout.write(JSON.stringify({
    type: 'stream_event',
    event: { delta: { type: 'text_delta', text: 'world' } },
  }) + '\\n');
  process.stdout.write(JSON.stringify({
    type: 'result',
    result: 'hello world',
    session_id: session,
  }) + '\\n');
  process.exit(0);
}, 400);
`,
  );

  const serviceA = new ClaudeService(binPath, runsDir);
  let startedPid: number | null = null;
  let startedLog: string | null = null;

  const runPromise = serviceA.runStreaming('agent-1', {
    cwd: tmp,
    prompt: 'hi',
    onStarted: (handle) => {
      startedPid = handle.pid;
      startedLog = handle.logPath;
    },
  });

  // Wait until the process is up, then simulate orchestrator shutdown.
  await new Promise((r) => setTimeout(r, 80));
  assert.ok(startedPid, 'expected onStarted pid');
  assert.ok(startedLog, 'expected onStarted log path');
  assert.equal(isPidAlive(startedPid!), true);

  // App shutdown: release handles without killing agents.
  serviceA.releaseAll();
  assert.equal(isPidAlive(startedPid!), true, 'Claude must keep running after releaseAll');

  const serviceB = new ClaudeService(binPath, runsDir);
  const result = await serviceB.attachToRun('agent-1', {
    pid: startedPid!,
    logPath: startedLog!,
  });

  // Original in-process monitor may still finish; ignore its outcome (simulates process.exit).
  await runPromise.catch(() => undefined);

  assert.equal(result.sessionId, 'sess-detach-1');
  assert.equal(result.result, 'hello world');
  assert.equal(result.stopped, false);
  assert.equal(isPidAlive(startedPid!), false);

  await fs.rm(tmp, { recursive: true, force: true });
});

test('stop() kills a detached Claude process', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-stop-'));
  const binPath = path.join(tmp, 'fake-claude');
  const runsDir = path.join(tmp, 'runs');

  await writeFakeClaude(
    binPath,
    `#!/usr/bin/env node
setInterval(() => {
  process.stdout.write(JSON.stringify({ type: 'ping' }) + '\\n');
}, 100);
`,
  );

  const service = new ClaudeService(binPath, runsDir);
  let pid: number | null = null;

  const done = service.runStreaming('agent-stop', {
    cwd: tmp,
    prompt: 'hi',
    onStarted: (handle) => {
      pid = handle.pid;
    },
  });

  await new Promise((r) => setTimeout(r, 80));
  assert.ok(pid);
  assert.equal(isPidAlive(pid!), true);

  const stopped = service.stop('agent-stop');
  assert.equal(stopped, true);

  const result = await done;
  assert.equal(result.stopped || result.result === '[stopped]' || !isPidAlive(pid!), true);
  assert.equal(isPidAlive(pid!), false);

  await fs.rm(tmp, { recursive: true, force: true });
});

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

  await new Promise((r) => setTimeout(r, 120));
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

async function execGit(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', ['-C', cwd, ...args], {
    maxBuffer: 10 * 1024 * 1024,
  });
  return stdout.trim();
}

async function setupPrFetchFixture(): Promise<{
  tmp: string;
  origin: string;
  main: string;
  prCommit: string;
}> {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'pr-fetch-'));
  const origin = path.join(tmp, 'origin.git');
  const main = path.join(tmp, 'main');

  await execGit(tmp, ['init', '--bare', origin]);
  await execGit(tmp, ['clone', origin, main]);
  await execGit(main, ['config', 'user.email', 'test@example.com']);
  await execGit(main, ['config', 'user.name', 'Test']);
  await fs.writeFile(path.join(main, 'README.md'), 'main\n');
  await execGit(main, ['add', 'README.md']);
  await execGit(main, ['commit', '-m', 'initial']);
  const current = await execGit(main, ['branch', '--show-current']);
  if (current !== 'main') {
    await execGit(main, ['branch', '-M', 'main']);
  }
  await execGit(main, ['push', '-u', 'origin', 'main']);

  await execGit(main, ['checkout', '-b', 'pr-head']);
  await fs.writeFile(path.join(main, 'feature.txt'), 'pr change\n');
  await execGit(main, ['add', 'feature.txt']);
  await execGit(main, ['commit', '-m', 'pr commit']);
  const prCommit = await execGit(main, ['rev-parse', 'HEAD']);
  await execGit(main, ['push', 'origin', 'pr-head']);
  // Simulate GitHub's pull/N/head ref on the remote
  await execGit(origin, ['update-ref', 'refs/pull/33/head', prCommit]);
  await execGit(main, ['checkout', 'main']);

  return { tmp, origin, main, prCommit };
}

test('fetchPullRequest creates local branch when not checked out', async () => {
  const { tmp, main, prCommit } = await setupPrFetchFixture();
  const git = new GitService();

  await git.fetchPullRequest(main, 33, 'pr-33');

  const tip = await execGit(main, ['rev-parse', 'pr-33']);
  assert.equal(tip, prCommit);
  assert.equal(await git.getWorktreePathForBranch(main, 'pr-33'), null);

  await fs.rm(tmp, { recursive: true, force: true });
});

test('fetchPullRequest succeeds when local PR branch is already checked out in a worktree', async () => {
  const { tmp, main, origin, prCommit } = await setupPrFetchFixture();
  const git = new GitService();
  const worktreePath = path.join(tmp, 'pr-33-update-node');

  // First fetch + worktree — the real-world state that triggered the bug
  await git.fetchPullRequest(main, 33, 'pr-33');
  await git.addWorktree(main, worktreePath, 'pr-33');
  assert.equal(await git.getWorktreePathForBranch(main, 'pr-33'), worktreePath);

  // Advance the remote PR head so a direct fetch into refs/heads/pr-33 would refuse
  const updater = path.join(tmp, 'updater');
  await execGit(tmp, ['clone', origin, updater]);
  await execGit(updater, ['config', 'user.email', 'test@example.com']);
  await execGit(updater, ['config', 'user.name', 'Test']);
  await execGit(updater, ['fetch', 'origin', 'pull/33/head']);
  await execGit(updater, ['checkout', '-B', 'pr-head', 'FETCH_HEAD']);
  await fs.writeFile(path.join(updater, 'feature.txt'), 'pr change v2\n');
  await execGit(updater, ['add', 'feature.txt']);
  await execGit(updater, ['commit', '-m', 'pr commit v2']);
  const newerCommit = await execGit(updater, ['rev-parse', 'HEAD']);
  await execGit(updater, ['push', 'origin', 'pr-head']);
  await execGit(origin, ['update-ref', 'refs/pull/33/head', newerCommit]);

  // This used to throw: refusing to fetch into branch 'refs/heads/pr-33' checked out at ...
  await assert.doesNotReject(() => git.fetchPullRequest(main, 33, 'pr-33'));

  assert.equal(await git.getWorktreePathForBranch(main, 'pr-33'), worktreePath);
  // Local checked-out tip is left alone; remote-tracking pull ref is updated
  assert.equal(await execGit(worktreePath, ['rev-parse', 'pr-33']), prCommit);
  assert.equal(await execGit(main, ['rev-parse', 'refs/remotes/pull/33/head']), newerCommit);

  await fs.rm(tmp, { recursive: true, force: true });
});
