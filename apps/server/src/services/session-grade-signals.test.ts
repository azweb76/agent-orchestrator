import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { AgentEvent, Message } from '@agent-orchestrator/shared';
import {
  BLOATED_SKILL_CHARS,
  collectCorrectionSignals,
  collectOversizedSkills,
  collectSkippedSkills,
  looksLikeUserCorrection,
} from './session-grade-signals.js';

function msg(role: Message['role'], content: string, extras?: Partial<Message>): Message {
  return {
    id: extras?.id ?? `${role}-${content.slice(0, 12)}`,
    agentId: 'ag-1',
    sessionId: 'sess-1',
    role,
    content,
    attachments: [],
    metadata: extras?.metadata ?? {},
    createdAt: extras?.createdAt ?? '2026-01-01T00:00:00.000Z',
  };
}

describe('session grade signals', () => {
  it('lists available skills that were never used', () => {
    assert.deepEqual(
      collectSkippedSkills(['/retry-tests'], [
        { command: '/retry-tests' },
        { command: '/code-review' },
        { command: '/plan-work' },
      ]),
      ['/code-review', '/plan-work'],
    );
  });

  it('flags oversized skills past the bloat threshold', () => {
    const oversized = collectOversizedSkills([
      { command: '/tiny', description: 'x', charCount: 80 },
      { command: '/huge', description: 'y', charCount: BLOATED_SKILL_CHARS + 1 },
    ]);
    assert.deepEqual(
      oversized.map((item) => item.command),
      ['/huge'],
    );
  });

  it('detects user corrections after an assistant turn', () => {
    assert.equal(looksLikeUserCorrection('No, use the existing Explore skill'), true);
    assert.equal(looksLikeUserCorrection('Please add tests'), false);

    const signals = collectCorrectionSignals([
      msg('user', 'Fix CI'),
      msg('assistant', 'I will explore the whole repo'),
      msg('user', 'No, do not re-explore. Use /plan-work.'),
      msg('assistant', 'ok', {
        metadata: {
          timeline: [{ type: 'tool', id: 't1', name: 'Bash', detail: 'npm test', status: 'error' }],
        },
      }),
    ]);
    assert.equal(signals.some((item) => item.kind === 'user_correction'), true);
    assert.equal(signals.some((item) => item.kind === 'tool_error'), true);
  });

  it('includes rewind and permission denials from events', () => {
    const events: AgentEvent[] = [
      {
        id: 'e1',
        agentId: 'ag-1',
        type: 'chat_rewound',
        data: { sessionId: 'sess-1', removed: 4 },
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'e2',
        agentId: 'ag-1',
        type: 'permission_denied',
        data: { sessionId: 'sess-1', toolName: 'Bash', message: 'User denied this action' },
        createdAt: '2026-01-01T00:00:01.000Z',
      },
    ];
    const signals = collectCorrectionSignals([], events, 'sess-1');
    assert.equal(signals.length, 2);
    assert.equal(signals[0]?.kind, 'rewind');
    assert.equal(signals[1]?.kind, 'permission_denied');
  });
});
