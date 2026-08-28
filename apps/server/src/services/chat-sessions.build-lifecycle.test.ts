import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  buildApprovedPlan,
  createAgentSession,
  deleteAgentSession,
  getAgentDetail,
  getAgentMessages,
  rewindAgentChat,
} from './app.js';
import { mockResponse, seedAgent } from './chat-sessions.test-helpers.js';

test('buildApprovedPlan stashes the plan session and streams into a new Build session', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ao-chat-build-'));
  try {
    const { ctx, agent } = await seedAgent(tmp);
    const { res, chunks } = mockResponse();
    await buildApprovedPlan(
      ctx,
      agent.id,
      { plan: '## Plan\n\n1. Do the thing.' },
      res,
      'plan-sess',
    );

    const sessions = ctx.repos.sessions.listByAgent(agent.id);
    assert.equal(sessions.length, 2);
    const plan = sessions.find((item) => item.id === 'plan-sess');
    const build = sessions.find((item) => item.template === 'build');
    assert.ok(build);
    assert.equal(plan?.claudeSessionId, 'claude-plan');
    assert.equal(ctx.repos.messages.listBySession('plan-sess').length, 2);
    assert.ok(ctx.repos.messages.listBySession(build!.id).length >= 1);
    assert.equal(ctx.repos.agents.getById(agent.id)?.activeSessionId, build?.id);
    assert.ok(chunks.some((chunk) => chunk.includes('event: session')));
    assert.deepEqual(
      getAgentMessages(ctx, agent.id, 'plan-sess').map((item) => item.id),
      ['u1', 'a1'],
    );
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('buildApprovedPlan kickoff includes plan Q&A and mentioned file paths', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ao-chat-build-rich-'));
  try {
    const { ctx, agent } = await seedAgent(tmp);
    const planText =
      '## Plan\n\nUpdate `apps/server/src/services/plan-handoff.ts` and packages/shared/src/plan-handoff.ts.';

    ctx.repos.events.create({
      id: 'evt-perm',
      agentId: agent.id,
      type: 'permission_request',
      data: {
        sessionId: 'plan-sess',
        requestId: 'req-plan',
        toolName: 'AskUserQuestion',
        input: {
          questions: [{ question: 'Testing strategy?', header: 'Tests', options: [{ label: 'Unit' }] }],
        },
      },
      createdAt: '2026-01-01T00:00:02.500Z',
    });
    ctx.repos.events.create({
      id: 'evt-answer',
      agentId: agent.id,
      type: 'ask_user_question_answered',
      data: {
        sessionId: 'plan-sess',
        requestId: 'req-plan',
        answers: { 'Testing strategy?': 'Unit tests' },
      },
      createdAt: '2026-01-01T00:00:02.600Z',
    });

    const { res } = mockResponse();
    await buildApprovedPlan(ctx, agent.id, { plan: planText }, res, 'plan-sess');

    const build = ctx.repos.sessions.listByAgent(agent.id).find((item) => item.template === 'build');
    assert.ok(build);
    const kickoff = ctx.repos.messages
      .listBySession(build!.id)
      .find((item) => item.role === 'user');
    assert.ok(kickoff?.content.includes('## Approved plan'));
    assert.ok(kickoff?.content.includes(planText.trim()));
    assert.ok(kickoff?.content.includes('## Planning Q&A'));
    assert.ok(kickoff?.content.includes('Testing strategy?'));
    assert.ok(kickoff?.content.includes('Unit tests'));
    assert.ok(kickoff?.content.includes('## Files mentioned'));
    assert.ok(kickoff?.content.includes('apps/server/src/services/plan-handoff.ts'));
    assert.ok(kickoff?.content.includes('packages/shared/src/plan-handoff.ts'));

    assert.equal(ctx.repos.messages.listBySession('plan-sess').length, 2);
    assert.deepEqual(
      getAgentMessages(ctx, agent.id, 'plan-sess').map((item) => item.id),
      ['u1', 'a1'],
    );
    assert.equal(build?.permissionMode, 'auto');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('getAgentDetail includes sessions', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ao-chat-detail-'));
  try {
    const { ctx, agent } = await seedAgent(tmp);
    const detail = await getAgentDetail(ctx, agent.id);
    assert.equal(detail.sessions.length, 1);
    assert.equal(detail.activeSessionId, 'plan-sess');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('deleteAgentSession removes a session and keeps the other', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ao-chat-del-'));
  try {
    const { ctx, agent } = await seedAgent(tmp);
    const created = await createAgentSession(ctx, agent.id, { template: 'review' });
    ctx.repos.messages.create({
      id: 'r1',
      agentId: agent.id,
      sessionId: created.session.id,
      role: 'user',
      content: 'review this',
      attachments: [],
      metadata: {},
      createdAt: '2026-01-01T00:00:03.000Z',
    });
    const queuedAttachmentPath = path.join(tmp, 'queued-image.png');
    await fs.writeFile(queuedAttachmentPath, 'image');
    ctx.repos.queued.create({
      id: 'queued-r1',
      agentId: agent.id,
      sessionId: created.session.id,
      content: '(image attachment)',
      attachments: [
        {
          id: 'queued-image',
          type: 'image',
          mimeType: 'image/png',
          name: 'queued-image.png',
          path: queuedAttachmentPath,
          url: '/api/agents/ag-1/attachments/queued-image',
        },
      ],
      createdAt: '2026-01-01T00:00:04.000Z',
    });
    assert.equal(ctx.repos.sessions.listByAgent(agent.id).length, 2);

    const detail = await deleteAgentSession(ctx, agent.id, created.session.id);
    const sessions = ctx.repos.sessions.listByAgent(agent.id);
    assert.equal(sessions.length, 1);
    assert.equal(sessions[0]?.id, 'plan-sess');
    assert.equal(detail.activeSessionId, 'plan-sess');
    assert.equal(ctx.repos.messages.listBySession('plan-sess').length, 2);
    assert.equal(ctx.repos.messages.listBySession(created.session.id).length, 0);
    assert.equal(ctx.repos.sessions.getById(created.session.id), null);
    assert.equal(ctx.repos.queued.listBySession(created.session.id).length, 0);
    await assert.rejects(fs.access(queuedAttachmentPath));
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('deleteAgentSession recreates a chat session when deleting the last one', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ao-chat-del-last-'));
  try {
    const { ctx, agent } = await seedAgent(tmp);
    const detail = await deleteAgentSession(ctx, agent.id, 'plan-sess');
    assert.equal(detail.sessions.length, 1);
    assert.notEqual(detail.sessions[0]?.id, 'plan-sess');
    assert.equal(detail.sessions[0]?.title, 'New chat');
    assert.equal(detail.sessions[0]?.template, 'chat');
    assert.equal(detail.activeSessionId, detail.sessions[0]?.id);
    assert.equal(ctx.repos.messages.listBySession(detail.sessions[0]!.id).length, 0);
    assert.equal(ctx.repos.messages.listBySession('plan-sess').length, 0);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('deleteAgentSession rejects archived agents', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ao-chat-del-arch-'));
  try {
    const { ctx, agent } = await seedAgent(tmp);
    ctx.repos.agents.update({
      ...ctx.repos.agents.getById(agent.id)!,
      status: 'archived',
      archivedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await assert.rejects(
      () => deleteAgentSession(ctx, agent.id, 'plan-sess'),
      /archived/,
    );
    assert.equal(ctx.repos.sessions.listByAgent(agent.id).length, 1);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('rewindAgentChat clears the discarded session lineage and grade', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ao-chat-rewind-grade-'));
  try {
    const { ctx, agent } = await seedAgent(tmp);
    const session = ctx.repos.sessions.getById('plan-sess')!;
    ctx.repos.sessions.update({
      ...session,
      runLogPath: path.join(tmp, 'old-run.log'),
    });
    ctx.repos.sessions.setGrade(
      session.id,
      { score: 3, comment: 'Old grade', gradedAt: new Date().toISOString() },
      'old transcript',
    );

    await rewindAgentChat(ctx, agent.id, { messageId: 'u1' }, session.id);

    const updated = ctx.repos.sessions.getById(session.id);
    assert.equal(updated?.claudeSessionId, null);
    assert.equal(updated?.runLogPath, null);
    assert.equal(updated?.grade, null);
    assert.equal(ctx.repos.sessions.getGradeTranscript(session.id), '');
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});
