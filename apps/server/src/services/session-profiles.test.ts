import assert from 'node:assert/strict';
import test from 'node:test';
import {
  defaultFromGoalProfile,
  FROM_GOAL_PROFILE_NAME,
  renderProfilePromptTemplate,
  sanitizeProfileAllowedTools,
} from '@agent-orchestrator/shared';
import { buildClaudeArgs } from './claude-args.js';
import {
  createSessionProfile,
  deleteSessionProfile,
  ensureFromGoalProfile,
  updateSessionProfile,
} from './session-profiles.js';
import type { AppContext } from './app-context.js';
import { createRepositories, initDatabase } from '../db/index.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function tempCtx(): { ctx: AppContext; cleanup: () => void } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ao-profiles-'));
  const db = initDatabase(dir);
  const repos = createRepositories(db);
  return {
    ctx: {
      repos,
      git: {} as AppContext['git'],
      github: {} as AppContext['github'],
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

test('defaultFromGoalProfile locks name and builtIn', () => {
  const seed = defaultFromGoalProfile({ title: 'Custom', listed: true });
  assert.equal(seed.name, FROM_GOAL_PROFILE_NAME);
  assert.equal(seed.builtIn, true);
  assert.equal(seed.title, 'Custom');
  assert.equal(seed.listed, true);
});

test('renderProfilePromptTemplate passes through raw goal by default', () => {
  assert.equal(renderProfilePromptTemplate(null, { goal: 'Ship dark mode' }), 'Ship dark mode');
  assert.equal(renderProfilePromptTemplate('  ', { goal: 'Ship dark mode' }), 'Ship dark mode');
});

test('renderProfilePromptTemplate substitutes {{goal}}', () => {
  assert.equal(
    renderProfilePromptTemplate('Goal:\n{{goal}}\nDo it.', { goal: 'Add tests' }),
    'Goal:\nAdd tests\nDo it.',
  );
});

test('sanitizeProfileAllowedTools strips interactive tools', () => {
  assert.equal(sanitizeProfileAllowedTools(null), null);
  assert.equal(sanitizeProfileAllowedTools(''), null);
  assert.equal(
    sanitizeProfileAllowedTools('Read,AskUserQuestion,ExitPlanMode,Bash'),
    'Read,Bash',
  );
  assert.equal(sanitizeProfileAllowedTools('AskUserQuestion,ExitPlanMode'), null);
});

test('buildClaudeArgs appends system prompt when set', () => {
  const args = buildClaudeArgs({
    permissionMode: 'plan',
    systemPrompt: 'Prefer TypeScript.',
  });
  assert.ok(args.includes('--append-system-prompt'));
  assert.equal(args[args.indexOf('--append-system-prompt') + 1], 'Prefer TypeScript.');
});

test('buildClaudeArgs omits system prompt when blank', () => {
  const args = buildClaudeArgs({ permissionMode: 'plan', systemPrompt: '  ' });
  assert.ok(!args.includes('--append-system-prompt'));
});

test('ensureFromGoalProfile seeds once and CRUD protects built-in delete', () => {
  const { ctx, cleanup } = tempCtx();
  try {
    const first = ensureFromGoalProfile(ctx);
    const second = ensureFromGoalProfile(ctx);
    assert.equal(first.id, second.id);
    assert.equal(first.name, FROM_GOAL_PROFILE_NAME);
    assert.equal(first.builtIn, true);

    const created = createSessionProfile(ctx, {
      name: 'review-deep',
      title: 'Deep review',
      description: 'Thorough review',
      model: 'opus',
      effort: 'xhigh',
      permissionMode: 'plan',
      listed: true,
      systemPrompt: 'Be thorough.',
      allowedTools: 'Read,AskUserQuestion',
    });
    assert.equal(created.allowedTools, 'Read');
    assert.equal(created.systemPrompt, 'Be thorough.');

    const updated = updateSessionProfile(ctx, created.id, { title: 'Deeper review' });
    assert.equal(updated.title, 'Deeper review');

    assert.throws(() => deleteSessionProfile(ctx, first.id), /cannot be deleted/i);
    deleteSessionProfile(ctx, created.id);
    assert.equal(ctx.repos.sessionProfiles.getById(created.id), null);
  } finally {
    cleanup();
  }
});
