import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import type { Agent, Workspace, Worktree } from '@agent-orchestrator/shared';
import { createRepositories, initDatabase } from '../db/index.js';
import {
  applyAgentInstructionFile,
  generateAgentInstructionDraft,
  getAgentDetail,
  gradeAgentSession,
  updateAgentSession,
  type AppContext,
} from './app.js';
import type { AnthropicService } from './anthropic.js';
import type { ClaudeService, GitService } from './git.js';

describe('session grading and instruction files', () => {
  let dataDir: string;
  let ctx: AppContext;

  function seed(): { agent: Agent } {
    const workspace: Workspace = {
      id: 'ws-1',
      name: 'demo',
      repoUrl: 'https://github.com/example/demo',
      repoPath: path.join(dataDir, 'demo'),
      defaultBranch: 'main',
      githubOwner: 'example',
      githubRepo: 'demo',
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    ctx.repos.workspaces.create(workspace);
    const worktree: Worktree = {
      id: 'wt-1',
      workspaceId: workspace.id,
      name: 'feat',
      path: path.join(dataDir, 'wt'),
      branch: 'feat',
      prNumber: null,
      prTitle: null,
      baseBranch: 'main',
      createdAt: '2026-01-01T00:00:00.000Z',
    };
    ctx.repos.worktrees.create(worktree);
    fs.mkdirSync(worktree.path, { recursive: true });

    const agent: Agent = {
      id: 'ag-1',
      worktreeId: worktree.id,
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
    ctx.repos.agents.create(agent);
    ctx.repos.sessions.create({
      id: 'sess-1',
      agentId: agent.id,
      title: 'Chat',
      template: 'chat',
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
    ctx.repos.sessions.create({
      id: 'sess-2',
      agentId: agent.id,
      title: 'Review',
      template: 'review',
      status: 'idle',
      model: 'sonnet',
      effort: 'high',
      permissionMode: 'plan',
      claudeSessionId: null,
      pid: null,
      runLogPath: null,
      createdAt: '2026-01-01T00:00:01.000Z',
      updatedAt: '2026-01-01T00:00:01.000Z',
    });
    ctx.repos.messages.create({
      id: 'm1',
      agentId: agent.id,
      sessionId: 'sess-1',
      role: 'user',
      content: 'Add retry logic',
      attachments: [],
      metadata: {},
      createdAt: '2026-01-01T00:00:02.000Z',
    });
    ctx.repos.messages.create({
      id: 'm2',
      agentId: agent.id,
      sessionId: 'sess-1',
      role: 'assistant',
      content: 'I skipped the tests.',
      attachments: [],
      metadata: {},
      createdAt: '2026-01-01T00:00:03.000Z',
    });
    return { agent };
  }

  beforeEach(() => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ao-grade-'));
    ctx = {
      repos: createRepositories(initDatabase(dataDir)),
      git: {} as GitService,
      github: {} as AppContext['github'],
      claude: { stop: () => true } as unknown as ClaudeService,
      anthropic: {
        generateInstructionDraft: async () => ({
          kind: 'skill',
          action: 'create',
          scope: 'project',
          name: 'retry-tests',
          description: 'Always run tests after retries',
          relativePath: '.claude/skills/retry-tests/SKILL.md',
          content:
            '---\nname: retry-tests\ndescription: Always run tests after retries\n---\n# Retry tests\n',
          rationale: 'The assistant skipped tests.',
        }),
      } as unknown as AnthropicService,
      dataDir,
    };
  });

  afterEach(() => {
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it('rejects grading an empty session', async () => {
    seed();
    await assert.rejects(
      () => gradeAgentSession(ctx, 'ag-1', 'sess-2', { score: 3 }),
      /empty session/,
    );
  });

  it('persists a grade on the session and keeps it after unrelated updates', async () => {
    seed();
    const graded = await gradeAgentSession(ctx, 'ag-1', 'sess-1', {
      score: 2,
      comment: 'Skipped tests',
    });
    assert.equal(graded.grade?.score, 2);
    assert.equal(graded.grade?.comment, 'Skipped tests');
    assert.match(ctx.repos.sessions.getGradeTranscript('sess-1'), /Add retry logic/);

    await updateAgentSession(ctx, 'ag-1', 'sess-1', { title: 'Retries' });
    const detail = await getAgentDetail(ctx, 'ag-1');
    const session = detail.sessions.find((item) => item.id === 'sess-1');
    assert.equal(session?.title, 'Retries');
    assert.equal(session?.grade?.score, 2);
    assert.equal(detail.sessions.find((item) => item.id === 'sess-2')?.grade, null);
  });

  it('generates a draft from the graded transcript and writes a skill file', async () => {
    seed();
    await gradeAgentSession(ctx, 'ag-1', 'sess-1', { score: 2, comment: 'Skipped tests' });
    const draft = await generateAgentInstructionDraft(ctx, 'ag-1', 'sess-1', { kind: 'skill' });
    assert.equal(draft.relativePath, '.claude/skills/retry-tests/SKILL.md');

    const applied = await applyAgentInstructionFile(ctx, 'ag-1', {
      kind: 'skill',
      scope: 'project',
      name: 'retry-tests',
      content: draft.content,
    });
    assert.equal(applied.action, 'create');
    const written = fs.readFileSync(
      path.join(dataDir, 'wt', '.claude', 'skills', 'retry-tests', 'SKILL.md'),
      'utf8',
    );
    assert.match(written, /retry-tests/);
  });
});
