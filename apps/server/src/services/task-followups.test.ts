import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createRepositories, initDatabase } from '../db/index.js';
import type { AppContext } from './app-context.js';
import {
  createTaskFollowUp,
  deleteTaskFollowUp,
  ensureBuiltInTaskFollowUps,
  listTaskFollowUps,
  updateTaskFollowUp,
} from './task-followups.js';

function tempCtx(): { ctx: AppContext; cleanup: () => void } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ao-followups-'));
  const db = initDatabase(dir);
  const repos = createRepositories(db);
  return {
    ctx: {
      repos,
      git: {} as AppContext['git'],
      github: {} as AppContext['github'],
      jira: {} as AppContext['jira'],
      claude: {} as AppContext['claude'],
      anthropic: {} as AppContext['anthropic'],
      dataDir: dir,
    },
    cleanup: () => {
      db.close();
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

test('ensureBuiltInTaskFollowUps seeds status chips once', () => {
  const { ctx, cleanup } = tempCtx();
  try {
    ensureBuiltInTaskFollowUps(ctx);
    const first = listTaskFollowUps(ctx);
    assert.ok(first.some((item) => item.name === 'commit-and-push' && item.builtIn));
    assert.ok(first.some((item) => item.name === 'continue' && item.builtIn));
    const count = first.length;
    ensureBuiltInTaskFollowUps(ctx);
    assert.equal(listTaskFollowUps(ctx).length, count);
  } finally {
    cleanup();
  }
});

test('create/update/delete custom follow-ups; built-ins cannot be deleted', () => {
  const { ctx, cleanup } = tempCtx();
  try {
    ensureBuiltInTaskFollowUps(ctx);

    const created = createTaskFollowUp(ctx, {
      name: 'add-tests',
      title: 'Add tests',
      description: 'Cover the new helper',
      prompt: 'Add unit tests for the helper.',
    });
    assert.equal(created.kind, 'prompt');
    assert.equal(created.builtIn, false);

    const updated = updateTaskFollowUp(ctx, created.id, {
      title: 'Add unit tests',
      enabled: false,
    });
    assert.equal(updated.title, 'Add unit tests');
    assert.equal(updated.enabled, false);

    deleteTaskFollowUp(ctx, created.id);
    assert.equal(
      listTaskFollowUps(ctx).some((item) => item.id === created.id),
      false,
    );

    const builtin = listTaskFollowUps(ctx).find((item) => item.name === 'continue');
    assert.ok(builtin);
    assert.throws(() => deleteTaskFollowUp(ctx, builtin.id), /cannot be deleted/);
  } finally {
    cleanup();
  }
});
