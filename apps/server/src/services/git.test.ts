import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import { readFileSync } from 'node:fs';
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

async function waitFor(predicate: () => boolean, timeoutMs = 4000, pollMs = 40): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return;
    await new Promise((r) => setTimeout(r, pollMs));
  }
  throw new Error('timed out waiting for condition');
}

const FAKE_CLAUDE_ASK_USER = `#!/usr/bin/env node
const readline = require('readline');
const session = 'sess-perm-1';
const rl = readline.createInterface({ input: process.stdin });
let gotPrompt = false;
rl.on('line', (line) => {
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  if (!gotPrompt && msg.type === 'user') {
    gotPrompt = true;
    process.stdout.write(JSON.stringify({ type: 'system', session_id: session }) + '\\n');
    process.stdout.write(JSON.stringify({
      type: 'stream_event',
      event: { delta: { type: 'text_delta', text: 'What should I do?' } },
    }) + '\\n');
    process.stdout.write(JSON.stringify({
      type: 'control_request',
      request_id: 'req-1',
      request: {
        subtype: 'can_use_tool',
        tool_name: 'AskUserQuestion',
        input: {
          questions: [{
            question: 'Pick one',
            header: 'Q',
            options: [{ label: 'A', description: 'A' }],
          }],
        },
      },
    }) + '\\n');
    return;
  }
  if (msg.type === 'control_response') {
    process.stdout.write(JSON.stringify({
      type: 'stream_event',
      event: { delta: { type: 'text_delta', text: ' thanks' } },
    }) + '\\n');
    process.stdout.write(JSON.stringify({
      type: 'result',
      result: 'What should I do? thanks',
      session_id: session,
    }) + '\\n');
    process.exit(0);
  }
});
`;

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

test('AskUserQuestion survives releaseAll and can be answered after reattach', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-perm-'));
  const binPath = path.join(tmp, 'fake-claude');
  const runsDir = path.join(tmp, 'runs');
  await writeFakeClaude(binPath, FAKE_CLAUDE_ASK_USER);

  const serviceA = new ClaudeService(binPath, runsDir);
  let startedPid: number | null = null;
  let startedLog: string | null = null;
  const seenText: string[] = [];

  const runPromise = serviceA.runStreaming('agent-1', {
    cwd: tmp,
    prompt: 'hi',
    onStarted: (handle) => {
      startedPid = handle.pid;
      startedLog = handle.logPath;
    },
    onEvent: (event) => {
      if (event.event?.delta?.type === 'text_delta' && event.event.delta.text) {
        seenText.push(event.event.delta.text);
      }
    },
  });

  await waitFor(() => serviceA.listPendingPermissions('agent-1').length === 1);
  assert.ok(startedPid);
  assert.ok(startedLog);
  assert.equal(isPidAlive(startedPid!), true);
  assert.equal(serviceA.listPendingPermissions('agent-1')[0]?.toolName, 'AskUserQuestion');
  assert.deepEqual(seenText, ['What should I do?']);

  serviceA.releaseAll();
  assert.equal(isPidAlive(startedPid!), true, 'Claude must keep running while waiting for input');

  const serviceB = new ClaudeService(binPath, runsDir);
  const restored: string[] = [];
  const attachPromise = serviceB.attachToRun(
    'agent-1',
    { pid: startedPid!, logPath: startedLog! },
    {
      onPermissionRequest: (request) => restored.push(request.toolName),
    },
  );

  await waitFor(() => serviceB.listPendingPermissions('agent-1').length === 1);
  assert.equal(isPidAlive(startedPid!), true, 'reattach must not kill a waiting session');
  assert.deepEqual(restored, ['AskUserQuestion']);
  assert.equal(serviceB.listPendingPermissions('agent-1')[0]?.requestId, 'req-1');

  const answered = serviceB.respondToPermission('agent-1', 'req-1', {
    behavior: 'allow',
    updatedInput: { answers: { Q: 'A' } },
  });
  assert.equal(answered, true);

  const result = await attachPromise;
  await runPromise.catch(() => undefined);

  assert.equal(result.stopped, false);
  assert.equal(result.result, 'What should I do? thanks');
  assert.equal(isPidAlive(startedPid!), false);

  await fs.rm(tmp, { recursive: true, force: true });
});

test('reattach does not kill a run whose log already contains an answered control_request', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-replay-cr-'));
  const binPath = path.join(tmp, 'fake-claude');
  const runsDir = path.join(tmp, 'runs');

  await writeFakeClaude(
    binPath,
    `#!/usr/bin/env node
process.stdout.write(JSON.stringify({
  type: 'control_request',
  request_id: 'req-old',
  request: { subtype: 'can_use_tool', tool_name: 'AskUserQuestion', input: {} },
}) + '\\n');
process.stdout.write(JSON.stringify({
  type: 'stream_event',
  event: { delta: { type: 'text_delta', text: 'already answered' } },
}) + '\\n');
setInterval(() => {
  process.stdout.write(JSON.stringify({ type: 'ping' }) + '\\n');
}, 80);
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

  await waitFor(() => startedPid != null && startedLog != null);
  await waitFor(() => {
    try {
      return readFileSync(startedLog!, 'utf8').includes('already answered');
    } catch {
      return false;
    }
  });

  serviceA.releaseAll();
  assert.equal(isPidAlive(startedPid!), true);

  const serviceB = new ClaudeService(binPath, runsDir);
  const attachPromise = serviceB.attachToRun('agent-1', {
    pid: startedPid!,
    logPath: startedLog!,
  });

  await new Promise((r) => setTimeout(r, 200));
  assert.equal(
    isPidAlive(startedPid!),
    true,
    'historical AskUserQuestion in the log must not stop a still-running agent',
  );
  assert.equal(
    serviceB.listPendingPermissions('agent-1').length,
    0,
    'answered control_request should not be restored as pending',
  );

  serviceB.stop('agent-1', startedPid, startedLog);
  await attachPromise.catch(() => undefined);
  await runPromise.catch(() => undefined);
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

test('runStreaming rejects when the Claude binary is missing instead of crashing', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-missing-'));
  const runsDir = path.join(tmp, 'runs');
  const service = new ClaudeService(path.join(tmp, 'no-such-claude'), runsDir);

  await assert.rejects(
    () => service.runStreaming('sess-missing', { cwd: tmp, prompt: 'hi' }),
    /Failed to start Claude process/,
  );

  await fs.rm(tmp, { recursive: true, force: true });
});

test('runStreaming completes when Claude emits result then waits on stdin', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-result-eof-'));
  const binPath = path.join(tmp, 'fake-claude');
  const runsDir = path.join(tmp, 'runs');
  await writeFakeClaude(
    binPath,
    `#!/usr/bin/env node
const readline = require('readline');
const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  if (msg.type !== 'user') return;
  process.stdout.write(JSON.stringify({ type: 'system', session_id: 'sess-eof' }) + '\\n');
  process.stdout.write(JSON.stringify({
    type: 'stream_event',
    event: { delta: { type: 'text_delta', text: 'Hi!' } },
  }) + '\\n');
  process.stdout.write(JSON.stringify({
    type: 'result',
    result: 'Hi!',
    session_id: 'sess-eof',
  }) + '\\n');
});
rl.on('close', () => process.exit(0));
`,
  );

  const service = new ClaudeService(binPath, runsDir);
  let pid: number | null = null;
  const result = await service.runStreaming('sess-eof', {
    cwd: tmp,
    prompt: 'hi',
    onStarted: (handle) => {
      pid = handle.pid;
    },
  });

  assert.equal(result.result, 'Hi!');
  assert.equal(result.sessionId, 'sess-eof');
  assert.equal(result.stopped, false);
  assert.ok(pid);
  assert.equal(isPidAlive(pid), false);
  assert.equal(service.getRunningProcess('sess-eof'), undefined);

  await fs.rm(tmp, { recursive: true, force: true });
});

test('runStreaming reaps a process that hangs after the result event', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-result-hang-'));
  const binPath = path.join(tmp, 'fake-claude');
  const runsDir = path.join(tmp, 'runs');
  await writeFakeClaude(
    binPath,
    `#!/usr/bin/env node
const readline = require('readline');
const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  if (msg.type !== 'user') return;
  process.stdout.write(JSON.stringify({ type: 'system', session_id: 'sess-hang' }) + '\\n');
  process.stdout.write(JSON.stringify({
    type: 'assistant',
    message: { content: [{ type: 'text', text: 'Hi there.' }] },
  }) + '\\n');
  process.stdout.write(JSON.stringify({
    type: 'result',
    result: 'Hi there.',
    session_id: 'sess-hang',
  }) + '\\n');
});
setInterval(() => {}, 1000);
`,
  );

  const service = new ClaudeService(binPath, runsDir);
  let pid: number | null = null;
  const result = await service.runStreaming('sess-hang', {
    cwd: tmp,
    prompt: 'hi',
    onStarted: (handle) => {
      pid = handle.pid;
    },
  });

  assert.equal(result.result, 'Hi there.');
  assert.equal(result.sessionId, 'sess-hang');
  assert.equal(result.stopped, false);
  assert.ok(pid);
  assert.equal(isPidAlive(pid), false);
  assert.equal(service.getRunningProcess('sess-hang'), undefined);

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

test('getDiff pending includes unstaged and untracked files; base ref shows branch commits', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'git-diff-'));
  const repo = path.join(tmp, 'repo');
  await fs.mkdir(repo);
  await execGit(tmp, ['init', repo]);
  await execGit(repo, ['config', 'user.email', 'test@example.com']);
  await execGit(repo, ['config', 'user.name', 'Test']);
  await fs.writeFile(path.join(repo, 'README.md'), 'main\n');
  await execGit(repo, ['add', 'README.md']);
  await execGit(repo, ['commit', '-m', 'initial']);
  const current = await execGit(repo, ['branch', '--show-current']);
  if (current !== 'main') {
    await execGit(repo, ['branch', '-M', 'main']);
  }

  await execGit(repo, ['checkout', '-b', 'feature']);
  await fs.writeFile(path.join(repo, 'committed.txt'), 'on branch\n');
  await execGit(repo, ['add', 'committed.txt']);
  await execGit(repo, ['commit', '-m', 'branch commit']);

  await fs.writeFile(path.join(repo, 'README.md'), 'main\npending edit\n');
  await fs.writeFile(path.join(repo, 'new-file.txt'), 'untracked\n');

  const git = new GitService();
  const pending = await git.getDiff(repo);
  assert.match(pending.patch, /pending edit/);
  assert.match(pending.patch, /new-file\.txt/);
  assert.doesNotMatch(pending.patch, /on branch/);

  const vsMain = await git.getDiff(repo, 'main');
  assert.match(vsMain.patch, /committed\.txt/);
  assert.match(vsMain.patch, /pending edit/);
  // Untracked files are only included for pending (HEAD) diffs.
  assert.doesNotMatch(vsMain.patch, /new-file\.txt/);

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
