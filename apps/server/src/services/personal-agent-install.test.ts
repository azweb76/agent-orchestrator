import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { promisify } from 'node:util';
import { createRepositories, initDatabase } from '../db/index.js';
import type { AppContext } from './app-context.js';
import { GitService } from './git-ops.js';
import { installRepoAgents, previewRepoAgents } from './personal-agent-install.js';

const execFileAsync = promisify(execFile);

describe('personal-agent-install', () => {
  let tmp = '';
  let home = '';
  let ctx: AppContext;
  let db: ReturnType<typeof initDatabase>;

  before(async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ao-agent-install-'));
    home = path.join(tmp, 'home');
    const repoPath = path.join(tmp, 'repo');
    fs.mkdirSync(path.join(repoPath, '.claude', 'agents'), { recursive: true });
    fs.writeFileSync(
      path.join(repoPath, '.claude', 'agents', 'code-reviewer.md'),
      '---\nname: code-reviewer\ndescription: Review diffs\ntools: Read\n---\n# Review\n',
    );
    await execFileAsync('git', ['init', '-b', 'main', repoPath]);
    await execFileAsync('git', ['-C', repoPath, 'config', 'user.email', 'test@example.com']);
    await execFileAsync('git', ['-C', repoPath, 'config', 'user.name', 'Test']);
    await execFileAsync('git', ['-C', repoPath, 'add', '.']);
    await execFileAsync('git', ['-C', repoPath, 'commit', '-m', 'agents']);

    db = initDatabase(tmp);
    const repos = createRepositories(db);
    repos.workspaces.create({
      id: 'ws-1',
      name: 'demo',
      repoUrl: 'https://github.com/acme/demo.git',
      repoPath,
      defaultBranch: 'main',
      githubOwner: 'acme',
      githubRepo: 'demo',
      createdAt: new Date().toISOString(),
    });
    ctx = {
      repos,
      git: new GitService(),
      github: {} as AppContext['github'],
      jira: {} as AppContext['jira'],
      claude: {} as AppContext['claude'],
      anthropic: {} as AppContext['anthropic'],
      dataDir: tmp,
    };
  });

  after(() => {
    db?.close();
    if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('previews and installs agents from a workspace clone', async () => {
    const preview = await previewRepoAgents(ctx, { workspaceId: 'ws-1' }, home);
    assert.equal(preview.repo, 'demo');
    assert.equal(preview.agents.length, 1);
    assert.equal(preview.agents[0]?.slug, 'code-reviewer');
    assert.equal(preview.agents[0]?.alreadyInstalled, false);

    const result = await installRepoAgents(
      ctx,
      { workspaceId: 'ws-1', slugs: ['code-reviewer'] },
      home,
    );
    assert.equal(result.installed.length, 1);
    assert.equal(result.skipped.length, 0);
    const agentPath = path.join(home, '.claude', 'agents', 'code-reviewer.md');
    assert.match(fs.readFileSync(agentPath, 'utf8'), /Review diffs/);

    const skipped = await installRepoAgents(
      ctx,
      { workspaceId: 'ws-1', slugs: ['code-reviewer'] },
      home,
    );
    assert.equal(skipped.installed.length, 0);
    assert.equal(skipped.skipped[0]?.reason, 'Already installed');

    const overwritten = await installRepoAgents(
      ctx,
      { workspaceId: 'ws-1', slugs: ['code-reviewer'], overwrite: true },
      home,
    );
    assert.equal(overwritten.installed.length, 1);
  });
});
