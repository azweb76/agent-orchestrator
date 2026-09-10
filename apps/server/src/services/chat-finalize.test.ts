import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import type { AppContext } from './app-context.js';
import { finalizeSessionRun } from './chat-finalize.js';
import { seedAgent } from './chat-sessions.test-helpers.js';

describe('finalizeSessionRun', () => {
  let dataDir: string;
  let ctx: AppContext;

  beforeEach(async () => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ao-finalize-'));
    ({ ctx } = await seedAgent(dataDir));
  });

  afterEach(() => {
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it('persists the assistant turn when the placeholder row was deleted mid-run', () => {
    const session = ctx.repos.sessions.getById('plan-sess')!;
    // Simulate a rewind/clearAgentChat racing the run: the placeholder that
    // the client expects to be filled in has already been removed.
    ctx.repos.messages.deleteFrom(session.agentId, 'a1');
    assert.equal(ctx.repos.messages.getById(session.agentId, 'a1'), null);

    const saved = finalizeSessionRun(
      ctx,
      session,
      { result: 'Final answer.', sessionId: 'claude-plan' },
      '',
      {},
      { assistantMessageId: 'a1' },
    );

    assert.equal(saved.content, 'Final answer.');

    const persisted = ctx.repos.messages.getById(session.agentId, 'a1');
    assert.ok(persisted, 'expected the finalized message to be persisted');
    assert.equal(persisted?.content, 'Final answer.');

    const inSession = ctx.repos.messages.listBySession(session.id);
    assert.ok(inSession.some((m) => m.id === 'a1' && m.content === 'Final answer.'));
  });

  it('updates the existing row in place when the placeholder is still present (happy path)', () => {
    const session = ctx.repos.sessions.getById('plan-sess')!;
    const before = ctx.repos.messages.getById(session.agentId, 'a1');
    assert.ok(before);

    const saved = finalizeSessionRun(
      ctx,
      session,
      { result: 'Updated answer.', sessionId: 'claude-plan' },
      '',
      {},
      { assistantMessageId: 'a1' },
    );

    assert.equal(saved.content, 'Updated answer.');
    const persisted = ctx.repos.messages.getById(session.agentId, 'a1');
    assert.equal(persisted?.content, 'Updated answer.');

    // Still exactly one row for id 'a1' — an update, not a duplicate insert.
    const all = ctx.repos.messages.listBySession(session.id).filter((m) => m.id === 'a1');
    assert.equal(all.length, 1);
  });

  it('does not resurrect a message into a session that no longer exists', () => {
    const session = ctx.repos.sessions.getById('plan-sess')!;
    ctx.repos.messages.deleteFrom(session.agentId, 'a1');
    ctx.repos.sessions.delete(session.id);
    assert.equal(ctx.repos.sessions.getById(session.id), null);

    const saved = finalizeSessionRun(
      ctx,
      session,
      { result: 'Too late.', sessionId: 'claude-plan' },
      '',
      {},
      { assistantMessageId: 'a1' },
    );

    // The caller still gets a message object to send over the wire (matches
    // existing behavior on this branch), but nothing should be written to
    // a session that has been cleared/archived away.
    assert.equal(saved.content, 'Too late.');
    assert.equal(ctx.repos.messages.getById(session.agentId, 'a1'), null);
  });
});
