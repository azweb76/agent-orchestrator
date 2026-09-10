import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRepositories, initDatabase } from '../db/index.js';
import type { AppContext } from './app-context.js';
import { createAgentTask } from './agent-tasks.js';
import { selectAgentTaskForGoalOrNull } from './worktrees.js';

type Candidate = { name: string; title: string; purpose: string };

function tempCtx(select: AppContext['anthropic']['selectAgentTaskForGoal']): {
  ctx: AppContext;
  cleanup: () => void;
} {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ao-select-task-'));
  const db = initDatabase(dir);
  const repos = createRepositories(db);
  return {
    ctx: {
      repos,
      git: {} as AppContext['git'],
      github: {} as AppContext['github'],
      jira: {} as AppContext['jira'],
      claude: {} as AppContext['claude'],
      anthropic: { selectAgentTaskForGoal: select } as AppContext['anthropic'],
      dataDir: dir,
    },
    cleanup: () => {
      db.close();
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

test('selectAgentTaskForGoalOrNull only sends tasks that have a purpose', async () => {
  let seen: Candidate[] = [];
  const { ctx, cleanup } = tempCtx(async (_goal, candidates) => {
    seen = candidates as Candidate[];
    return null;
  });
  try {
    createAgentTask(ctx, { name: 'fix-bugs', title: 'Fix bugs', purpose: '  Bug fixes  ' });
    createAgentTask(ctx, { name: 'blank', title: 'Blank', purpose: '' });

    await selectAgentTaskForGoalOrNull(ctx, 'fix the flaky test');

    assert.deepEqual(
      seen.map((item) => item.name),
      ['fix-bugs'],
    );
    assert.equal(seen[0]?.purpose, 'Bug fixes');
  } finally {
    cleanup();
  }
});

test('selectAgentTaskForGoalOrNull returns the matched task', async () => {
  const { ctx, cleanup } = tempCtx(async () => 'fix-bugs');
  try {
    createAgentTask(ctx, { name: 'fix-bugs', title: 'Fix bugs', purpose: 'Bug fixes' });
    createAgentTask(ctx, { name: 'new-feature', title: 'New feature', purpose: 'Features' });

    const task = await selectAgentTaskForGoalOrNull(ctx, 'fix the flaky test');
    assert.equal(task?.name, 'fix-bugs');
  } finally {
    cleanup();
  }
});

test('selectAgentTaskForGoalOrNull returns null when nothing matches', async () => {
  const { ctx, cleanup } = tempCtx(async () => null);
  try {
    createAgentTask(ctx, { name: 'fix-bugs', title: 'Fix bugs', purpose: 'Bug fixes' });

    assert.equal(await selectAgentTaskForGoalOrNull(ctx, 'unrelated goal'), null);
  } finally {
    cleanup();
  }
});

test('selectAgentTaskForGoalOrNull throws when no task has a purpose', async () => {
  const { ctx, cleanup } = tempCtx(async () => 'fix-bugs');
  try {
    createAgentTask(ctx, { name: 'blank', title: 'Blank', purpose: '' });

    await assert.rejects(
      () => selectAgentTaskForGoalOrNull(ctx, 'anything'),
      /No tasks with a purpose/,
    );
  } finally {
    cleanup();
  }
});

test('selectAgentTaskForGoalOrNull wraps AI failures', async () => {
  const { ctx, cleanup } = tempCtx(async () => {
    throw new Error('missing credentials');
  });
  try {
    createAgentTask(ctx, { name: 'fix-bugs', title: 'Fix bugs', purpose: 'Bug fixes' });

    await assert.rejects(
      () => selectAgentTaskForGoalOrNull(ctx, 'anything'),
      /Could not match goal to a task: missing credentials/,
    );
  } finally {
    cleanup();
  }
});
