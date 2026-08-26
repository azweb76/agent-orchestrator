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
import type { SessionGradeContext } from './session-grade.js';
import { encodeClaudeProjectDir } from './claude-session-file.js';

describe('session grading and instruction files', () => {
  let dataDir: string;
  let ctx: AppContext;
  let lastGradeContext: SessionGradeContext | undefined;

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
    lastGradeContext = undefined;
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
        analyzeSessionGrade: async (input: SessionGradeContext) => {
          lastGradeContext = input;
          return {
          score: 2,
          summary: 'The assistant skipped tests and reread files.',
          findings: [
            {
              category: 'excessive_turns',
              severity: 'warning',
              title: 'Could be shorter',
              detail: 'The same request was restated.',
            },
            {
              category: 'wasted_tokens',
              severity: 'issue',
              title: 'Skipped tests',
              detail: 'Work shipped without running tests.',
            },
            {
              category: 'bloated_context',
              severity: 'ok',
              title: 'Context is fine',
              detail: 'Instruction files are small.',
            },
            {
              category: 'instruction_files',
              severity: 'warning',
              title: 'Missing AGENTS.md',
              detail: 'No AGENTS.md is present.',
            },
            {
              category: 'skills',
              severity: 'issue',
              title: 'Add a retry-tests skill',
              detail: input.notes || 'A skill would prevent skipped tests.',
            },
          ],
          stats: input.stats,
          };
        },
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
      () => gradeAgentSession(ctx, 'ag-1', 'sess-2', {}),
      /empty session/,
    );
  });

  it('uses AI analysis to persist a grade with findings', async () => {
    seed();
    const graded = await gradeAgentSession(ctx, 'ag-1', 'sess-1', { notes: 'Please be strict' });
    assert.equal(graded.grade?.score, 2);
    assert.match(graded.grade?.comment ?? '', /skipped tests/i);
    assert.equal(graded.grade?.analysis?.findings.length, 5);
    assert.equal(
      graded.grade?.analysis?.findings.find((item) => item.category === 'skills')?.detail,
      'Please be strict',
    );
    assert.equal(graded.grade?.analysis?.stats.userTurns, 1);
    assert.match(ctx.repos.sessions.getGradeTranscript('sess-1'), /Add retry logic/);

    await updateAgentSession(ctx, 'ag-1', 'sess-1', { title: 'Retries' });
    const detail = await getAgentDetail(ctx, 'ag-1');
    const session = detail.sessions.find((item) => item.id === 'sess-1');
    assert.equal(session?.title, 'Retries');
    assert.equal(session?.grade?.score, 2);
    assert.equal(session?.grade?.analysis?.findings[0]?.category, 'excessive_turns');
    assert.equal(detail.sessions.find((item) => item.id === 'sess-2')?.grade, null);
  });

  it('grades the Claude session file instead of the database transcript', async () => {
    seed();
    const worktree = ctx.repos.worktrees.getById('wt-1')!;
    const claudeSessionId = 'claude-sess-path';
    ctx.repos.sessions.update({
      ...ctx.repos.sessions.getById('sess-1')!,
      claudeSessionId,
    });

    const configDir = path.join(dataDir, 'claude-config');
    const sessionFile = path.join(
      configDir,
      'projects',
      encodeClaudeProjectDir(worktree.path),
      `${claudeSessionId}.jsonl`,
    );
    fs.mkdirSync(path.dirname(sessionFile), { recursive: true });
    fs.writeFileSync(
      sessionFile,
      [
        JSON.stringify({
          type: 'user',
          message: { role: 'user', content: 'SESSION_FILE_ONLY_PROMPT fix retries from disk' },
        }),
        JSON.stringify({
          type: 'assistant',
          message: {
            role: 'assistant',
            content: [
              { type: 'text', text: 'SESSION_FILE_ONLY_REPLY reading src/retry.ts' },
              {
                type: 'tool_use',
                id: 't1',
                name: 'Read',
                input: { file_path: 'src/retry.ts' },
              },
              {
                type: 'tool_use',
                id: 't2',
                name: 'Skill',
                input: { skill: 'retry-tests' },
              },
            ],
            usage: { input_tokens: 400, output_tokens: 50 },
          },
        }),
        JSON.stringify({ type: 'result', total_cost_usd: 0.37 }),
        '',
      ].join('\n'),
    );

    const previous = process.env.CLAUDE_CONFIG_DIR;
    process.env.CLAUDE_CONFIG_DIR = configDir;
    try {
      const graded = await gradeAgentSession(ctx, 'ag-1', 'sess-1');
      assert.equal(graded.grade?.analysis?.sessionFilePath, sessionFile);
      assert.match(lastGradeContext?.transcript ?? '', /SESSION_FILE_ONLY_PROMPT/);
      assert.match(lastGradeContext?.transcript ?? '', /SESSION_FILE_ONLY_REPLY/);
      assert.doesNotMatch(lastGradeContext?.transcript ?? '', /Add retry logic/);
      assert.equal(lastGradeContext?.sessionFilePath, sessionFile);
      assert.equal(lastGradeContext?.stats.toolCalls, 2);
      assert.equal(lastGradeContext?.stats.estimatedTokens, 450);
      assert.equal(lastGradeContext?.stats.costUsd, 0.37);
      assert.deepEqual(lastGradeContext?.usedSkills, ['retry-tests']);
      assert.match(ctx.repos.sessions.getGradeTranscript('sess-1'), /SESSION_FILE_ONLY_PROMPT/);
    } finally {
      if (previous == null) delete process.env.CLAUDE_CONFIG_DIR;
      else process.env.CLAUDE_CONFIG_DIR = previous;
    }
  });

  it('does not fall back to database messages when the session file is empty', async () => {
    seed();
    const worktree = ctx.repos.worktrees.getById('wt-1')!;
    const claudeSessionId = 'claude-empty';
    ctx.repos.sessions.update({
      ...ctx.repos.sessions.getById('sess-1')!,
      claudeSessionId,
    });
    const configDir = path.join(dataDir, 'claude-empty');
    const sessionFile = path.join(
      configDir,
      'projects',
      encodeClaudeProjectDir(worktree.path),
      `${claudeSessionId}.jsonl`,
    );
    fs.mkdirSync(path.dirname(sessionFile), { recursive: true });
    fs.writeFileSync(sessionFile, '{"type":"system","subtype":"init"}\n');

    const previous = process.env.CLAUDE_CONFIG_DIR;
    process.env.CLAUDE_CONFIG_DIR = configDir;
    try {
      await assert.rejects(
        () => gradeAgentSession(ctx, 'ag-1', 'sess-1'),
        /empty session file/,
      );
    } finally {
      if (previous == null) delete process.env.CLAUDE_CONFIG_DIR;
      else process.env.CLAUDE_CONFIG_DIR = previous;
    }
  });

  it('falls back to the run log path when the Claude JSONL is missing', async () => {
    seed();
    const runLog = path.join(dataDir, 'runs', 'sess-1-1.log');
    fs.mkdirSync(path.dirname(runLog), { recursive: true });
    fs.writeFileSync(
      runLog,
      [
        JSON.stringify({
          type: 'user',
          message: { role: 'user', content: 'RUN_LOG_ONLY_PROMPT from the orchestrator log' },
        }),
        JSON.stringify({
          type: 'assistant',
          message: { role: 'assistant', content: [{ type: 'text', text: 'RUN_LOG_ONLY_REPLY' }] },
        }),
        '',
      ].join('\n'),
    );
    ctx.repos.sessions.update({
      ...ctx.repos.sessions.getById('sess-1')!,
      claudeSessionId: 'missing-jsonl',
      runLogPath: runLog,
    });

    const previous = process.env.CLAUDE_CONFIG_DIR;
    process.env.CLAUDE_CONFIG_DIR = path.join(dataDir, 'empty-claude');
    try {
      const graded = await gradeAgentSession(ctx, 'ag-1', 'sess-1');
      assert.equal(graded.grade?.analysis?.sessionFilePath, runLog);
      assert.match(lastGradeContext?.transcript ?? '', /RUN_LOG_ONLY_PROMPT/);
      assert.doesNotMatch(lastGradeContext?.transcript ?? '', /Add retry logic/);
    } finally {
      if (previous == null) delete process.env.CLAUDE_CONFIG_DIR;
      else process.env.CLAUDE_CONFIG_DIR = previous;
    }
  });

  it('generates a draft from the graded transcript and writes a skill file', async () => {
    seed();
    await gradeAgentSession(ctx, 'ag-1', 'sess-1');
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
