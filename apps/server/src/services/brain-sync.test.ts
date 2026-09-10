import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';
import { createRepositories, initDatabase } from '../db/index.js';
import { GitService } from './git.js';
import type { AppContext } from './app-context.js';
import { createAgentTask } from './agent-tasks.js';
import {
  connectBrainRepo,
  createBrainPullRequest,
  disconnectBrainRepo,
  getBrainSyncStatus,
  parseBrainRepoRef,
  pullBrainRepo,
} from './brain-sync.js';
import {
  followUpToFile,
  parseFollowUpFile,
  parseTaskFile,
  stringifyBrainJson,
  taskToFile,
} from './brain-sync-files.js';

const execFileAsync = promisify(execFile);

async function execGit(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', args, { cwd, maxBuffer: 10 * 1024 * 1024 });
  return stdout.trim();
}

async function makeRemoteAndClone(): Promise<{
  tmp: string;
  remote: string;
  git: GitService;
}> {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ao-brain-sync-'));
  const remote = path.join(tmp, 'remote.git');
  const seed = path.join(tmp, 'seed');
  await execGit(tmp, ['init', '--bare', remote]);
  await fs.mkdir(seed);
  await execGit(seed, ['init', '-b', 'main']);
  await execGit(seed, ['config', 'user.email', 'test@example.com']);
  await execGit(seed, ['config', 'user.name', 'Test']);
  await fs.writeFile(path.join(seed, 'README.md'), 'brain\n');
  await execGit(seed, ['add', 'README.md']);
  await execGit(seed, ['commit', '-m', 'seed']);
  await execGit(seed, ['remote', 'add', 'origin', remote]);
  await execGit(seed, ['push', '-u', 'origin', 'main']);
  await execGit(remote, ['symbolic-ref', 'HEAD', 'refs/heads/main']);
  return { tmp, remote, git: new GitService() };
}

function mockCtx(
  git: GitService,
  dataDir: string,
  github: AppContext['github'] = {} as AppContext['github'],
): AppContext {
  const db = initDatabase(dataDir);
  return {
    repos: createRepositories(db),
    git,
    github,
    jira: {} as AppContext['jira'],
    claude: {} as AppContext['claude'],
    anthropic: {} as AppContext['anthropic'],
    dataDir,
  };
}

function brainClone(ctx: AppContext): string {
  return path.join(ctx.dataDir, 'brain');
}

test('parseBrainRepoRef accepts owner/repo and GitHub URLs', () => {
  assert.deepEqual(parseBrainRepoRef('acme/brain-lib'), {
    cloneUrl: 'https://github.com/acme/brain-lib.git',
    githubOwner: 'acme',
    githubRepo: 'brain-lib',
    isGitHub: true,
  });
  const fromUrl = parseBrainRepoRef('https://github.com/acme/brain-lib.git');
  assert.equal(fromUrl.githubOwner, 'acme');
  assert.equal(fromUrl.githubRepo, 'brain-lib');
  assert.equal(fromUrl.isGitHub, true);
  const local = parseBrainRepoRef('file:///tmp/demo.git');
  assert.equal(local.isGitHub, false);
  assert.equal(local.cloneUrl, 'file:///tmp/demo.git');
});

test('parseTaskFile clamps an imported permission mode that auto-approves tools', () => {
  for (const mode of ['bypassPermissions', 'dontAsk', 'auto']) {
    const parsed = parseTaskFile({ name: 'imported', title: 'Imported', permissionMode: mode });
    assert.notEqual(parsed, null, mode);
    assert.equal(parsed!.permissionMode, 'plan', mode);
  }
});

test('parseTaskFile keeps permission modes an import may legitimately pick', () => {
  for (const mode of ['default', 'acceptEdits', 'plan']) {
    const parsed = parseTaskFile({ name: 'imported', title: 'Imported', permissionMode: mode });
    assert.equal(parsed!.permissionMode, mode, mode);
  }
});

test('parseTaskFile drops imported tools outside the catalog but keeps scoped ones', () => {
  const parsed = parseTaskFile({
    name: 'imported',
    title: 'Imported',
    allowedTools: 'Bash(git:*),Read,NotARealTool,Edit',
  });
  const tools = (parsed!.allowedTools ?? '').split(',');
  assert.ok(tools.includes('Bash(git:*)'), 'scoped Bash entry should survive');
  assert.ok(tools.includes('Read'));
  assert.ok(tools.includes('Edit'));
  assert.equal(tools.includes('NotARealTool'), false, 'invented tool must be dropped');
});

test('parseTaskFile still refuses interactive tools in an import', () => {
  const parsed = parseTaskFile({
    name: 'imported',
    title: 'Imported',
    allowedTools: 'AskUserQuestion,ExitPlanMode,Read',
  });
  assert.equal(parsed!.allowedTools, 'Read');
});

test('parseTaskFile rejects invalid slugs', () => {
  assert.equal(parseTaskFile({ name: '1nope', title: 'x' }), null);
  const parsed = parseTaskFile({
    name: 'review-deep',
    title: 'Review',
    effort: 'high',
    permissionMode: 'plan',
  });
  assert.equal(parsed?.name, 'review-deep');
  assert.equal(parsed?.title, 'Review');
});

test('follow-up files round-trip the trigger', () => {
  const file = followUpToFile({
    id: 'followup-1',
    name: 'plan-check',
    title: 'Plan check',
    description: 'Review the plan.',
    prompt: 'Review the plan before building.',
    kind: 'prompt',
    template: null,
    enabled: true,
    trigger: 'exit-plan-mode',
    builtIn: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  });
  assert.equal(file.trigger, 'exit-plan-mode');
  assert.equal(parseFollowUpFile(file)?.trigger, 'exit-plan-mode');
});

test('parseFollowUpFile defaults a missing trigger instead of rejecting the file', () => {
  // Library files written before triggers existed must still import.
  const parsed = parseFollowUpFile({
    name: 'legacy-followup',
    title: 'Legacy',
    prompt: 'Do the thing.',
    kind: 'prompt',
  });
  assert.equal(parsed?.trigger, 'session-complete');
  const unknown = parseFollowUpFile({
    name: 'legacy-followup',
    title: 'Legacy',
    prompt: 'Do the thing.',
    trigger: 'not-a-trigger',
  });
  assert.equal(unknown?.trigger, 'session-complete');
});

test('parseFollowUpFile accepts the grade-session kind', () => {
  const parsed = parseFollowUpFile({
    name: 'grade-session',
    title: 'Grade session',
    prompt: 'Open the session grade dialog.',
    kind: 'grade-session',
  });
  assert.equal(parsed?.kind, 'grade-session');
});

test('brain sync reports modified files and can pull remote catalog updates', async () => {
  const { tmp, remote, git } = await makeRemoteAndClone();
  const dataDir = path.join(tmp, 'data');
  const home = path.join(tmp, 'home');
  await fs.mkdir(dataDir, { recursive: true });
  await fs.mkdir(home, { recursive: true });
  const ctx = mockCtx(git, dataDir);
  try {
    const connected = await connectBrainRepo(ctx, { repoUrl: remote }, home);
    assert.equal(connected.configured, true);
    assert.equal(connected.dirty, true);
    assert.ok(connected.changedFiles.some((file) => file.startsWith('tasks/')));

    await execGit(brainClone(ctx), ['add', '-A']);
    await execGit(brainClone(ctx), ['commit', '-m', 'baseline']);
    await execGit(brainClone(ctx), ['push', 'origin', 'main']);

    const clean = await getBrainSyncStatus(ctx, { homeDir: home, fetchRemote: true });
    assert.equal(clean.dirty, false);

    createAgentTask(ctx, {
      name: 'custom-sync-task',
      title: 'Review diffs',
      purpose: 'Sync test',
    });
    const dirty = await getBrainSyncStatus(ctx, { homeDir: home, fetchRemote: false });
    assert.equal(dirty.dirty, true);
    assert.ok(dirty.changedFiles.some((file) => file.includes('custom-sync-task')));

    const seed = path.join(tmp, 'seed');
    await execGit(seed, ['pull', 'origin', 'main']);
    await fs.mkdir(path.join(seed, 'tasks'), { recursive: true });
    await fs.writeFile(
      path.join(seed, 'tasks', 'from-origin.json'),
      stringifyBrainJson(
        taskToFile({
          id: 'remote',
          name: 'from-origin',
          title: 'From remote',
          description: '',
          purpose: 'Updated on origin',
          promptTemplate: null,
          systemPrompt: null,
          allowedTools: null,
          model: 'sonnet',
          effort: 'high',
          permissionMode: 'plan',
          listed: false,
          builtIn: false,
          createdAt: 't',
          updatedAt: 't',
        }),
      ),
    );
    await execGit(seed, ['add', 'tasks/from-origin.json']);
    await execGit(seed, ['commit', '-m', 'remote task']);
    await execGit(seed, ['push', 'origin', 'main']);

    await execGit(brainClone(ctx), ['reset', '--hard', 'HEAD']);
    await execGit(brainClone(ctx), ['clean', '-fd']);
    ctx.repos.agentTasks.delete(ctx.repos.agentTasks.getByName('custom-sync-task')!.id);

    const pulled = await pullBrainRepo(ctx, home);
    assert.equal(pulled.behindBy, 0);
    assert.equal(ctx.repos.agentTasks.getByName('from-origin')?.title, 'From remote');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('brain sync pull refuses a dirty working tree when origin is ahead', async () => {
  const { tmp, remote, git } = await makeRemoteAndClone();
  const dataDir = path.join(tmp, 'data');
  const home = path.join(tmp, 'home');
  await fs.mkdir(dataDir, { recursive: true });
  await fs.mkdir(home, { recursive: true });
  const ctx = mockCtx(git, dataDir);
  try {
    await connectBrainRepo(ctx, { repoUrl: remote }, home);
    await execGit(brainClone(ctx), ['add', '-A']);
    await execGit(brainClone(ctx), ['commit', '-m', 'baseline']);
    await execGit(brainClone(ctx), ['push', 'origin', 'main']);

    const seed = path.join(tmp, 'seed');
    await execGit(seed, ['pull', 'origin', 'main']);
    await fs.writeFile(path.join(seed, 'README.md'), 'two\n');
    await execGit(seed, ['add', 'README.md']);
    await execGit(seed, ['commit', '-m', 'remote']);
    await execGit(seed, ['push', 'origin', 'main']);

    createAgentTask(ctx, { name: 'local-only', title: 'Keep me' });
    await assert.rejects(() => pullBrainRepo(ctx, home), /uncommitted changes/);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('brain sync create PR commits modified files and records the PR URL', async () => {
  const { tmp, remote, git } = await makeRemoteAndClone();
  const dataDir = path.join(tmp, 'data');
  const home = path.join(tmp, 'home');
  await fs.mkdir(dataDir, { recursive: true });
  await fs.mkdir(home, { recursive: true });
  type PrOptions = { title: string; head: string; base: string; draft?: boolean };
  const created: PrOptions[] = [];
  const ctx = mockCtx(git, dataDir, {
    createPullRequest: async (_owner: string, _repo: string, options: PrOptions) => {
      created.push(options);
      return { number: 7, htmlUrl: 'https://github.com/acme/brain/pull/7' };
    },
  } as unknown as AppContext['github']);
  try {
    await connectBrainRepo(ctx, { repoUrl: remote }, home);
    ctx.repos.settings.set('brain_github_owner', 'acme');
    ctx.repos.settings.set('brain_github_repo', 'brain');
    createAgentTask(ctx, { name: 'pr-task', title: 'PR task' });

    const result = await createBrainPullRequest(
      ctx,
      { title: 'sync(brain): library', body: 'Update catalog', draft: true },
      home,
    );
    assert.equal(result.number, 7);
    assert.equal(result.htmlUrl, 'https://github.com/acme/brain/pull/7');
    assert.equal(result.status.lastPrNumber, 7);
    assert.equal(created[0]?.title, 'sync(brain): library');
    assert.match(created[0]?.head ?? '', /^brain-sync-/);
    assert.equal(created[0]?.base, 'main');
    assert.equal(created[0]?.draft, true);

    const disconnected = await disconnectBrainRepo(ctx);
    assert.equal(disconnected.configured, false);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('stringifyBrainJson is stable for task files', () => {
  const file = taskToFile({
    id: 'x',
    name: 'plan-work',
    title: 'Plan',
    description: '',
    purpose: 'Plan',
    promptTemplate: null,
    systemPrompt: null,
    allowedTools: null,
    model: 'sonnet',
    effort: 'high',
    permissionMode: 'plan',
    listed: true,
    builtIn: true,
    createdAt: 't',
    updatedAt: 't',
  });
  assert.match(stringifyBrainJson(file), /"name": "plan-work"/);
});
