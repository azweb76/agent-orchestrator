import assert from 'node:assert/strict';
import test from 'node:test';
import type { InstructionDraftOffer } from '@agent-orchestrator/shared';
import {
  clearInstructionDraftOffer,
  dismissInstructionDraftOffer,
  getInstructionDraftOffer,
  publishInstructionDraftOffer,
} from './instruction-offers.js';
import type { AppContext } from './app-context.js';

function mockCtx() {
  const store = new Map<string, string>();
  const events: unknown[] = [];
  const emits: unknown[] = [];
  const ctx = {
    repos: {
      automationState: {
        get: (key: string) => store.get(key) ?? null,
        set: (key: string, value: string) => {
          store.set(key, value);
        },
        delete: (key: string) => {
          store.delete(key);
        },
      },
      events: {
        create: (event: unknown) => {
          events.push(event);
        },
      },
    },
    notifier: {
      emit: (type: string, fields: unknown) => {
        emits.push({ type, fields });
      },
    },
  } as unknown as AppContext;
  return { ctx, store, events, emits };
}

test('publishInstructionDraftOffer persists and notifies', () => {
  const { ctx, store, events, emits } = mockCtx();
  const offer: InstructionDraftOffer = {
    sessionId: 'sess-1',
    gradedAt: '2026-01-01T00:00:00.000Z',
    findingTitles: ['Missing skill'],
    kind: 'skill',
    scope: 'project',
    draft: null,
  };
  publishInstructionDraftOffer(ctx, 'agent-1', offer);
  assert.deepEqual(getInstructionDraftOffer(ctx, 'agent-1'), offer);
  assert.equal(store.has('instruction-draft.offer:agent-1'), true);
  assert.equal(events.length, 1);
  assert.equal(emits[0] && (emits[0] as { type: string }).type, 'instruction_draft_offer');
  clearInstructionDraftOffer(ctx, 'agent-1');
  assert.equal(getInstructionDraftOffer(ctx, 'agent-1'), null);
});

test('dismissInstructionDraftOffer clears and emits dismissed', () => {
  const { ctx, emits } = mockCtx();
  publishInstructionDraftOffer(ctx, 'agent-1', {
    sessionId: 'sess-1',
    gradedAt: '2026-01-01T00:00:00.000Z',
    findingTitles: ['x'],
  });
  dismissInstructionDraftOffer(ctx, 'agent-1');
  assert.equal(getInstructionDraftOffer(ctx, 'agent-1'), null);
  const last = emits[emits.length - 1] as { fields: { data: { dismissed?: boolean } } };
  assert.equal(last.fields.data.dismissed, true);
});
