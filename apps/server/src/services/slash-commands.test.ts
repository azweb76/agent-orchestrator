import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import {
  discoverSlashCommands,
  filterSlashCommands,
  findSlashCommand,
} from './slash-commands.js';

describe('slash-commands', () => {
  let tmpRoot = '';

  before(async () => {
    tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ao-slash-'));
    await fs.mkdir(path.join(tmpRoot, '.claude', 'skills', 'deploy'), { recursive: true });
    await fs.writeFile(
      path.join(tmpRoot, '.claude', 'skills', 'deploy', 'SKILL.md'),
      `---
name: deploy
description: Deploy the service to staging
---
# Deploy
`,
    );
    await fs.mkdir(path.join(tmpRoot, '.claude', 'commands'), { recursive: true });
    await fs.writeFile(
      path.join(tmpRoot, '.claude', 'commands', 'ship.md'),
      `---
description: Ship the release
---
Ship it.
`,
    );
  });

  after(async () => {
    if (tmpRoot) await fs.rm(tmpRoot, { recursive: true, force: true });
  });

  it('discovers project skills and commands plus local /clear', async () => {
    const commands = await discoverSlashCommands(tmpRoot);
    const names = commands.map((c) => c.command);
    assert.ok(names.includes('/clear'));
    assert.ok(names.includes('/deploy'));
    assert.ok(names.includes('/ship'));
    assert.ok(names.includes('/diff'));
    assert.equal(findSlashCommand(commands, '/clear')?.kind, 'local');
    assert.equal(findSlashCommand(commands, '/deploy')?.kind, 'skill');
    assert.equal(findSlashCommand(commands, '/ship')?.source, 'project');
  });

  it('resolves /clear aliases', async () => {
    const commands = await discoverSlashCommands(tmpRoot);
    assert.equal(findSlashCommand(commands, '/reset')?.command, '/clear');
    assert.equal(findSlashCommand(commands, '/new')?.kind, 'local');
  });

  it('filters autocomplete by prefix including aliases', async () => {
    const commands = await discoverSlashCommands(tmpRoot);
    const matches = filterSlashCommands(commands, '/de');
    assert.ok(matches.some((item) => item.command === '/deploy'));
    const clearAlias = filterSlashCommands(commands, '/res');
    assert.ok(clearAlias.some((item) => item.command === '/clear'));
  });
});
