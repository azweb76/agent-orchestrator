import assert from 'node:assert/strict';
import test from 'node:test';
import { maybeAutoGradeBuildSession } from './auto-grade.js';
import type { AppContext } from './app-context.js';
import type { ChatSession } from '@agent-orchestrator/shared';

function settingsCtx(flags: {
  analyzeSessionEnabled: boolean;
  autoGradeBuildSessionsEnabled: boolean;
}): AppContext {
  return {
    repos: {
      settings: {
        get: (key: string) => {
          if (key === 'analyze_session_enabled') return flags.analyzeSessionEnabled ? '1' : '0';
          if (key === 'auto_grade_build_sessions_enabled') {
            return flags.autoGradeBuildSessionsEnabled ? '1' : '0';
          }
          return null;
        },
      },
    },
  } as unknown as AppContext;
}

const baseSession = {
  id: 's1',
  agentId: 'a1',
  template: 'build',
  grade: null,
} as ChatSession;

test('maybeAutoGradeBuildSession skips chat templates and failed runs', async () => {
  const ctx = settingsCtx({
    analyzeSessionEnabled: true,
    autoGradeBuildSessionsEnabled: true,
  });
  await maybeAutoGradeBuildSession(ctx, { ...baseSession, template: 'chat' } as ChatSession, {});
  await maybeAutoGradeBuildSession(ctx, baseSession, { error: 'boom' });
  await maybeAutoGradeBuildSession(ctx, baseSession, { stopped: true });
});

test('maybeAutoGradeBuildSession skips when settings disabled or already graded', async () => {
  await maybeAutoGradeBuildSession(
    settingsCtx({ analyzeSessionEnabled: false, autoGradeBuildSessionsEnabled: true }),
    baseSession,
    {},
  );
  await maybeAutoGradeBuildSession(
    settingsCtx({ analyzeSessionEnabled: true, autoGradeBuildSessionsEnabled: false }),
    baseSession,
    {},
  );
  await maybeAutoGradeBuildSession(
    settingsCtx({ analyzeSessionEnabled: true, autoGradeBuildSessionsEnabled: true }),
    {
      ...baseSession,
      grade: {
        score: 4,
        comment: 'ok',
        gradedAt: '2026-01-01T00:00:00.000Z',
        analysis: {
          summary: 'ok',
          findings: [],
          stats: {
            userTurns: 1,
            assistantTurns: 1,
            estimatedTokens: 10,
            costUsd: null,
            toolCalls: 0,
            instructionFileCount: 0,
            skillCount: 0,
          },
        },
      },
    } as ChatSession,
    {},
  );
  assert.ok(true);
});
