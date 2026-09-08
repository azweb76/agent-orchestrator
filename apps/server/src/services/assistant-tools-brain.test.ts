import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { ASSISTANT_TOOLS, parseBrainDraft } from '@agent-orchestrator/shared';
import { createRepositories, initDatabase } from '../db/index.js';
import type { AppContext } from './app-context.js';
import { AnthropicService } from './anthropic.js';
import { ClaudeService, GitService } from './git.js';
import { GitHubService } from './github.js';
import { JiraService } from './jira.js';
import { executeAssistantTool } from './assistant-tools.js';

function makeCtx(tmp: string): AppContext {
  const db = initDatabase(tmp);
  const repos = createRepositories(db);
  return {
    repos,
    git: new GitService(),
    github: new GitHubService({}),
    jira: new JiraService({}),
    claude: new ClaudeService('claude', path.join(tmp, 'runs')),
    anthropic: new AnthropicService(),
    dataDir: tmp,
  };
}

test('Brain assistant tools are registered', () => {
  const names = ASSISTANT_TOOLS.map((tool) => tool.name);
  assert.ok(names.includes('ask_user'));
  assert.ok(names.includes('propose_brain_draft'));
  assert.ok(names.includes('list_personal_skills'));
  assert.ok(names.includes('list_personal_agents'));
  assert.equal(ASSISTANT_TOOLS.find((tool) => tool.name === 'ask_user')?.risk, 'read');
  assert.equal(ASSISTANT_TOOLS.find((tool) => tool.name === 'propose_brain_draft')?.risk, 'read');
  assert.equal(ASSISTANT_TOOLS.find((tool) => tool.name === 'create_personal_skill')?.risk, 'write');
});

test('ask_user returns questions and awaitingUser', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ao-brain-tool-'));
  const ctx = makeCtx(tmp);
  const result = await executeAssistantTool(ctx, 'ask_user', {
    questions: [{ question: 'Scope?', options: [{ label: 'Personal' }] }],
  });
  assert.equal(result.awaitingUser, true);
  const body = JSON.parse(result.content) as { questions: Array<{ question: string }> };
  assert.equal(body.questions[0]?.question, 'Scope?');
});

test('propose_brain_draft returns a skill draft', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ao-brain-tool-'));
  const ctx = makeCtx(tmp);
  const result = await executeAssistantTool(ctx, 'propose_brain_draft', {
    kind: 'skill',
    name: 'always-run-tests',
    description: 'Run tests after edits',
    content: 'Always run the test suite before finishing.',
    rationale: 'Grades keep skipping tests.',
  });
  assert.equal(result.isError, undefined);
  const draft = parseBrainDraft(result.content);
  assert.equal(draft?.kind, 'skill');
  if (draft?.kind === 'skill') {
    assert.equal(draft.name, 'always-run-tests');
    assert.match(draft.content, /test suite/);
  }
});

test('create_personal_skill requires confirm', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ao-brain-tool-'));
  const ctx = makeCtx(tmp);
  const denied = await executeAssistantTool(ctx, 'create_personal_skill', {
    name: 'demo-skill',
    content: 'Do the thing.',
    confirm: false,
  });
  assert.equal(denied.isError, true);
});
