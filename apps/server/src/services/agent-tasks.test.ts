import assert from 'node:assert/strict';
import test from 'node:test';
import {
  renderAgentTaskPromptTemplate,
  sanitizeAgentTaskAllowedTools,
} from '@agent-orchestrator/shared';
import { buildClaudeArgs } from './claude-args.js';
import {
  createAgentTask,
  deleteAgentTask,
  updateAgentTask,
} from './agent-tasks.js';
import type { AppContext } from './app-context.js';
import { createRepositories, initDatabase } from '../db/index.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function tempCtx(): { ctx: AppContext; cleanup: () => void } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ao-tasks-'));
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

test('renderAgentTaskPromptTemplate passes through raw goal by default', () => {
  assert.equal(renderAgentTaskPromptTemplate(null, { goal: 'Ship dark mode' }), 'Ship dark mode');
  assert.equal(renderAgentTaskPromptTemplate('  ', { goal: 'Ship dark mode' }), 'Ship dark mode');
});

test('renderAgentTaskPromptTemplate substitutes {{goal}}', () => {
  assert.equal(
    renderAgentTaskPromptTemplate('Goal:\n{{goal}}\nDo it.', { goal: 'Add tests' }),
    'Goal:\nAdd tests\nDo it.',
  );
});

test('sanitizeAgentTaskAllowedTools strips interactive tools', () => {
  assert.equal(sanitizeAgentTaskAllowedTools(null), null);
  assert.equal(sanitizeAgentTaskAllowedTools(''), null);
  assert.equal(
    sanitizeAgentTaskAllowedTools('Read,AskUserQuestion,ExitPlanMode,Bash'),
    'Read,Bash',
  );
  assert.equal(sanitizeAgentTaskAllowedTools('AskUserQuestion,ExitPlanMode'), null);
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

test('agent task CRUD and built-in delete protection', () => {
  const { ctx, cleanup } = tempCtx();
  try {
    const created = createAgentTask(ctx, {
      name: 'review-deep',
      title: 'Deep review',
      description: 'Thorough review',
      purpose: 'Code review and quality checks',
      model: 'opus',
      effort: 'xhigh',
      permissionMode: 'plan',
      listed: true,
      systemPrompt: 'Be thorough.',
      allowedTools: 'Read,AskUserQuestion',
    });
    assert.equal(created.allowedTools, 'Read');
    assert.equal(created.systemPrompt, 'Be thorough.');
    assert.equal(created.purpose, 'Code review and quality checks');
    assert.equal(created.builtIn, false);

    const updated = updateAgentTask(ctx, created.id, { title: 'Deeper review' });
    assert.equal(updated.title, 'Deeper review');

    const builtIn = ctx.repos.agentTasks.create({
      ...created,
      id: crypto.randomUUID(),
      name: 'locked-task',
      title: 'Locked',
      purpose: '',
      builtIn: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    assert.throws(() => deleteAgentTask(ctx, builtIn.id), /cannot be deleted/i);

    deleteAgentTask(ctx, created.id);
    assert.equal(ctx.repos.agentTasks.getById(created.id), null);
  } finally {
    cleanup();
  }
});
