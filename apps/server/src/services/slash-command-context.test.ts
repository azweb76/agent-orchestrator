import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { after, before, describe, it } from 'node:test';
import type { Agent, Workspace, Worktree } from '@agent-orchestrator/shared';
import { createRepositories, initDatabase } from '../db/index.js';
import { GitService } from './git.js';
import type { GitHubService } from './github.js';
import {
  isContextSlashCommand,
  resolveSlashCommandContext,
  type SlashCommandContextDeps,
} from './slash-command-context.js';

const execFileAsync = promisify(execFile);

async function execGit(cwd: string, args: string[]): Promise<void> {
  await execFileAsync('git', ['-C', cwd, ...args], { maxBuffer: 10 * 1024 * 1024 });
}

function seedDeps(tmp: string, worktreePath: string): SlashCommandContextDeps {
  const db = initDatabase(tmp);
  const repos = createRepositories(db);
  repos.workspaces.create({
    id: 'ws-1',
    name: 'demo',
    repoUrl: 'https://github.com/example/demo',
    repoPath: tmp,
    defaultBranch: 'main',
    githubOwner: 'example',
    githubRepo: 'demo',
    createdAt: '2026-01-01T00:00:00.000Z',
  } satisfies Workspace);
  repos.worktrees.create({
    id: 'wt-1',
    workspaceId: 'ws-1',
    name: 'agent-1',
    path: worktreePath,
    branch: 'feat',
    prNumber: null,
    prTitle: null,
    baseBranch: 'main',
    createdAt: '2026-01-01T00:00:00.000Z',
  } satisfies Worktree);

  const agent: Agent = {
    id: 'ag-1',
    worktreeId: 'wt-1',
    name: 'Agent',
    status: 'idle',
    model: 'sonnet',
    effort: 'high',
    permissionMode: 'plan',
    claudeSessionId: null,
    pid: null,
    runLogPath: null,
    activeSessionId: 'sess-1',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    archivedAt: null,
  };
  repos.agents.create(agent);
  repos.sessions.create({
    id: 'sess-1',
    agentId: agent.id,
    title: 'Chat',
    template: 'chat',
    status: 'idle',
    model: agent.model,
    effort: agent.effort,
    permissionMode: agent.permissionMode,
    claudeSessionId: null,
    pid: null,
    runLogPath: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  });

  return {
    repos,
    git: new GitService(),
    github: {} as GitHubService,
  };
}

describe('slash-command-context', () => {
  let tmp = '';
  let repo = '';

  before(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ao-slash-ctx-'));
    repo = path.join(tmp, 'repo');
    await fs.mkdir(repo);
    await execGit(tmp, ['init', repo]);
    await execGit(repo, ['config', 'user.email', 'test@example.com']);
    await execGit(repo, ['config', 'user.name', 'Test']);
    await fs.writeFile(path.join(repo, 'README.md'), '# hello\n');
    await execGit(repo, ['add', 'README.md']);
    await execGit(repo, ['commit', '-m', 'initial']);
    await fs.writeFile(path.join(repo, 'README.md'), '# hello\n# change\n');
  });

  after(async () => {
    if (tmp) await fs.rm(tmp, { recursive: true, force: true });
  });

  it('detects context slash commands', () => {
    assert.equal(isContextSlashCommand('/diff'), true);
    assert.equal(isContextSlashCommand('/code-review extra'), true);
    assert.equal(isContextSlashCommand('hello'), false);
  });

  it('/diff attaches worktree diff context', async () => {
    const deps = seedDeps(tmp, repo);
    const agent = deps.repos.agents.getById('ag-1')!;
    const result = await resolveSlashCommandContext(
      deps,
      agent,
      repo,
      { githubOwner: 'example', githubRepo: 'demo' },
      { branch: 'feat' },
      '/diff',
    );
    assert.equal(result.handled, true);
    assert.equal(result.displayMessage, '/diff');
    assert.match(result.prompt, /git diff/i);
    assert.match(result.mentionContext ?? '', /### @diff/);
    assert.match(result.mentionContext ?? '', /README\.md/);
  });

  it('/test runs package.json test script and includes output', async () => {
    const testRoot = path.join(tmp, 'test-pkg');
    await fs.mkdir(testRoot, { recursive: true });
    await fs.writeFile(
      path.join(testRoot, 'package.json'),
      JSON.stringify({ scripts: { test: 'node -e "console.log(\\"ok\\")"' } }),
    );
    const deps = seedDeps(path.join(tmp, 'db-test'), testRoot);
    const agent = deps.repos.agents.getById('ag-1')!;
    const result = await resolveSlashCommandContext(
      deps,
      agent,
      testRoot,
      null,
      null,
      '/test',
    );
    assert.equal(result.handled, true);
    assert.match(result.prompt, /Ran: `npm test`/);
    assert.match(result.prompt, /ok/);
  });

  it('/test reports when no test script exists', async () => {
    const emptyRoot = path.join(tmp, 'no-test');
    await fs.mkdir(emptyRoot, { recursive: true });
    const deps = seedDeps(path.join(tmp, 'db-notest'), emptyRoot);
    const agent = deps.repos.agents.getById('ag-1')!;
    const result = await resolveSlashCommandContext(
      deps,
      agent,
      emptyRoot,
      null,
      null,
      '/test',
    );
    assert.match(result.prompt, /No workspace test script was found/);
  });

  it('/pr attaches PR title/body/checks or reports missing PR', async () => {
    const deps = seedDeps(path.join(tmp, 'db-pr'), repo);
    const agent = deps.repos.agents.getById('ag-1')!;
    deps.github = {
      getOpenPullRequestForBranch: async () => ({
        number: 12,
        title: 'Add feature',
        state: 'open',
        headRef: 'feat',
        baseRef: 'main',
        htmlUrl: 'https://github.com/example/demo/pull/12',
        draft: false,
        authorLogin: 'alice',
        updatedAt: '2026-01-01T00:00:00.000Z',
      }),
      getPullRequestDetail: async () => ({
        number: 12,
        title: 'Add feature',
        body: 'Summary body',
        htmlUrl: 'https://github.com/example/demo/pull/12',
        baseRef: 'main',
        headRef: 'feat',
        headSha: 'abc123def456',
        state: 'open',
        draft: false,
        merged: false,
        mergeable: true,
        mergeableState: 'clean',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      }),
      getPullRequestChecks: async () => ({
        headSha: 'abc123def456',
        rollup: 'success',
        total: 1,
        passing: 1,
        failing: 0,
        pending: 0,
        neutral: 0,
        truncated: false,
        checks: [
          {
            id: '1',
            name: 'CI',
            status: 'completed',
            conclusion: 'success',
            detailsUrl: 'https://github.com/example/demo/actions/runs/1',
          },
        ],
      }),
    } as unknown as GitHubService;

    const result = await resolveSlashCommandContext(
      deps,
      agent,
      repo,
      { githubOwner: 'example', githubRepo: 'demo' },
      { branch: 'feat' },
      '/pr',
    );
    assert.equal(result.handled, true);
    assert.match(result.mentionContext ?? '', /PR #12/);
    assert.match(result.mentionContext ?? '', /Summary body/);
    assert.match(result.mentionContext ?? '', /CI/);

    deps.github = {
      getOpenPullRequestForBranch: async () => null,
    } as unknown as GitHubService;
    const missing = await resolveSlashCommandContext(
      deps,
      agent,
      repo,
      { githubOwner: 'example', githubRepo: 'demo' },
      { branch: 'feat' },
      '/pr',
    );
    assert.match(missing.prompt, /No open pull request/);
  });

  it('/code-review focuses review session and inlines diff', async () => {
    const deps = seedDeps(path.join(tmp, 'db-review'), repo);
    const agent = deps.repos.agents.getById('ag-1')!;
    const result = await resolveSlashCommandContext(
      deps,
      agent,
      repo,
      { githubOwner: 'example', githubRepo: 'demo' },
      { branch: 'feat' },
      '/code-review',
    );
    assert.equal(result.handled, true);
    assert.equal(result.displayMessage, '/code-review');
    assert.ok(result.sessionSwitch);
    assert.equal(result.sessionSwitch?.template, 'review');
    assert.match(result.prompt, /Review the current uncommitted/);
    assert.match(result.mentionContext ?? '', /### @diff/);

    const again = await resolveSlashCommandContext(
      deps,
      agent,
      repo,
      { githubOwner: 'example', githubRepo: 'demo' },
      { branch: 'feat' },
      '/code-review',
    );
    assert.equal(again.sessionSwitch?.id, result.sessionSwitch?.id);
  });

  it('leaves unknown slash text untouched', async () => {
    const deps = seedDeps(path.join(tmp, 'db-unknown'), repo);
    const agent = deps.repos.agents.getById('ag-1')!;
    const result = await resolveSlashCommandContext(
      deps,
      agent,
      repo,
      { githubOwner: 'example', githubRepo: 'demo' },
      { branch: 'feat' },
      '/ship it now',
    );
    assert.equal(result.handled, false);
    assert.equal(result.prompt, '/ship it now');
  });
});
