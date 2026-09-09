import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { ASSISTANT_TOOLS, parseBrainDraft, toSessionGradeListItem } from '@agent-orchestrator/shared';
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
  assert.ok(names.includes('get_session_grade'));
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

test('propose_brain_draft returns a files array', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ao-brain-tool-'));
  const ctx = makeCtx(tmp);
  const result = await executeAssistantTool(ctx, 'propose_brain_draft', {
    files: [
      {
        kind: 'skill',
        name: 'always-run-tests',
        description: 'Run tests after edits',
        content: 'Always run the test suite.',
      },
      {
        kind: 'agent',
        name: 'reviewer',
        description: 'Review diffs',
        content: 'Focus on tests and edge cases.',
      },
    ],
  });
  assert.equal(result.isError, undefined);
  const body = JSON.parse(result.content) as { files?: Array<{ kind: string; name: string }> };
  assert.equal(body.files?.length, 2);
  assert.equal(body.files?.[0]?.kind, 'skill');
  assert.equal(body.files?.[1]?.kind, 'agent');
});

test('get_session_grade returns analysis for a graded session', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ao-brain-tool-'));
  const ctx = makeCtx(tmp);
  ctx.repos.workspaces.create({
    id: 'ws-1',
    name: 'demo',
    repoUrl: 'https://github.com/example/demo',
    repoPath: tmp,
    defaultBranch: 'main',
    githubOwner: 'example',
    githubRepo: 'demo',
    createdAt: '2026-01-01T00:00:00.000Z',
  });
  ctx.repos.worktrees.create({
    id: 'wt-1',
    workspaceId: 'ws-1',
    name: 'agent-1',
    path: tmp,
    branch: 'feat',
    prNumber: null,
    prTitle: null,
    baseBranch: 'main',
    createdAt: '2026-01-01T00:00:00.000Z',
  });
  ctx.repos.agents.create({
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
    activeSessionId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    archivedAt: null,
  });
  ctx.repos.sessions.create({
    id: 'sess-grade',
    agentId: 'ag-1',
    title: 'Build',
    template: 'build',
    status: 'idle',
    model: 'sonnet',
    effort: 'high',
    permissionMode: 'plan',
    claudeSessionId: null,
    pid: null,
    runLogPath: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  });
  ctx.repos.sessions.setGrade(
    'sess-grade',
    {
      score: 2,
      comment: 'Skipped tests',
      gradedAt: '2026-01-01T00:00:00.000Z',
      analysis: {
        summary: 'No tests',
        findings: [
          {
            category: 'skills',
            severity: 'issue',
            title: 'Never ran tests',
            detail: 'Shipped without vitest',
          },
        ],
        stats: {
          userTurns: 1,
          assistantTurns: 2,
          estimatedTokens: 100,
          costUsd: null,
          toolCalls: 1,
          instructionFileCount: 0,
          skillCount: 0,
        },
      },
    },
    'transcript',
  );
  const listed = ctx.repos.sessions.listRecentlyGraded(10).map(toSessionGradeListItem);
  assert.equal(listed[0]?.id, 'sess-grade');
  assert.deepEqual(listed[0]?.findingTitles, ['Never ran tests']);
  const missing = await executeAssistantTool(ctx, 'get_session_grade', { sessionId: 'nope' });
  assert.equal(missing.isError, true);
  const result = await executeAssistantTool(ctx, 'get_session_grade', { sessionId: 'sess-grade' });
  assert.equal(result.isError, undefined);
  const body = JSON.parse(result.content) as { score: number; comment: string };
  assert.equal(body.score, 2);
  assert.match(body.comment, /Skipped tests/);
});

test('propose_brain_draft returns task and follow-up files', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ao-brain-tool-'));
  const ctx = makeCtx(tmp);
  const result = await executeAssistantTool(ctx, 'propose_brain_draft', {
    files: [
      {
        kind: 'task',
        name: 'plan-feature',
        title: 'Plan feature',
        purpose: 'plan',
        promptTemplate: 'Plan {{goal}}',
      },
      {
        kind: 'follow-up',
        name: 'create-pr',
        title: 'Create PR',
        prompt: 'Open a draft PR',
        kindValue: 'prompt',
      },
    ],
  });
  assert.equal(result.isError, undefined);
  const body = JSON.parse(result.content) as { files?: Array<{ kind: string }> };
  assert.equal(body.files?.length, 2);
  assert.equal(body.files?.[0]?.kind, 'task');
  assert.equal(body.files?.[1]?.kind, 'follow-up');
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
