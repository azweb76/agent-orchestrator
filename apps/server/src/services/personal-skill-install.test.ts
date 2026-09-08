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
import { installRepoSkills, previewRepoSkills } from './personal-skill-install.js';

const execFileAsync = promisify(execFile);

describe('personal-skill-install', () => {
  let tmp = '';
  let home = '';
  let ctx: AppContext;
  let db: ReturnType<typeof initDatabase>;

  before(async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ao-skill-install-'));
    home = path.join(tmp, 'home');
    const repoPath = path.join(tmp, 'repo');
    fs.mkdirSync(path.join(repoPath, '.claude', 'skills', 'plan-work'), { recursive: true });
    fs.writeFileSync(
      path.join(repoPath, '.claude', 'skills', 'plan-work', 'SKILL.md'),
      '---\nname: plan-work\ndescription: Plan from a goal\n---\n# Plan\n',
    );
    fs.writeFileSync(path.join(repoPath, '.claude', 'skills', 'plan-work', 'notes.md'), 'extra\n');
    await execFileAsync('git', ['init', '-b', 'main', repoPath]);
    await execFileAsync('git', ['-C', repoPath, 'config', 'user.email', 'test@example.com']);
    await execFileAsync('git', ['-C', repoPath, 'config', 'user.name', 'Test']);
    await execFileAsync('git', ['-C', repoPath, 'add', '.']);
    await execFileAsync('git', ['-C', repoPath, 'commit', '-m', 'skills']);

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

  it('previews and installs skills from a workspace clone', async () => {
    const preview = await previewRepoSkills(ctx, { workspaceId: 'ws-1' }, home);
    assert.equal(preview.repo, 'demo');
    assert.equal(preview.skills.length, 1);
    assert.equal(preview.skills[0]?.slug, 'plan-work');
    assert.equal(preview.skills[0]?.alreadyInstalled, false);

    const result = await installRepoSkills(
      ctx,
      { workspaceId: 'ws-1', slugs: ['plan-work'] },
      home,
    );
    assert.equal(result.installed.length, 1);
    assert.equal(result.skipped.length, 0);
    const skillPath = path.join(home, '.claude', 'skills', 'plan-work', 'SKILL.md');
    assert.match(fs.readFileSync(skillPath, 'utf8'), /Plan from a goal/);
    assert.equal(
      fs.readFileSync(path.join(home, '.claude', 'skills', 'plan-work', 'notes.md'), 'utf8'),
      'extra\n',
    );

    const skipped = await installRepoSkills(
      ctx,
      { workspaceId: 'ws-1', slugs: ['plan-work'] },
      home,
    );
    assert.equal(skipped.installed.length, 0);
    assert.equal(skipped.skipped[0]?.reason, 'Already installed');

    const overwritten = await installRepoSkills(
      ctx,
      { workspaceId: 'ws-1', slugs: ['plan-work'], overwrite: true },
      home,
    );
    assert.equal(overwritten.installed.length, 1);
  });
});
