import assert from 'node:assert/strict';
import test from 'node:test';
import type { WorkspaceAiReadiness } from '@agent-orchestrator/shared';
import type { AppContext } from './app-context.js';
import { getCachedWorkspaceAiReadiness } from './workspace-ai-readiness.js';

const sampleReadiness: WorkspaceAiReadiness = {
  defaultBranch: 'main',
  analyzedRef: 'origin/main',
  analyzedSha: 'abc1234',
  score: 8,
  maxScore: 10,
  checks: [
    {
      id: 'claude_md_present',
      title: 'CLAUDE.md present',
      status: 'pass',
      detail: 'Found',
      recommendation: '',
    },
  ],
  files: [],
  skillPaths: [],
  llm: null,
  llmError: null,
  checkedAt: '2026-09-06T00:00:00.000Z',
};

function mockCtx(opts: { workspace?: boolean; cached?: WorkspaceAiReadiness | null } = {}) {
  const store = new Map<string, string>();
  if (opts.cached) {
    store.set('workspace-ai-readiness:ws-1', JSON.stringify(opts.cached));
  }
  const ctx = {
    repos: {
      workspaces: {
        getById: (id: string) =>
          opts.workspace === false
            ? null
            : id === 'ws-1'
              ? { id: 'ws-1', name: 'demo', repoPath: '/tmp/demo', defaultBranch: 'main' }
              : null,
      },
      automationState: {
        get: (key: string) => store.get(key) ?? null,
        set: (key: string, value: string) => {
          store.set(key, value);
        },
      },
    },
  } as unknown as AppContext;
  return { ctx, store };
}

test('getCachedWorkspaceAiReadiness returns null when never analyzed', async () => {
  const { ctx } = mockCtx({ workspace: true });
  const result = await getCachedWorkspaceAiReadiness(ctx, 'ws-1');
  assert.deepEqual(result, { readiness: null });
});

test('getCachedWorkspaceAiReadiness returns persisted readiness', async () => {
  const { ctx } = mockCtx({ workspace: true, cached: sampleReadiness });
  const result = await getCachedWorkspaceAiReadiness(ctx, 'ws-1');
  assert.deepEqual(result, { readiness: sampleReadiness });
});

test('getCachedWorkspaceAiReadiness rejects unknown workspace', async () => {
  const { ctx } = mockCtx({ workspace: false });
  await assert.rejects(() => getCachedWorkspaceAiReadiness(ctx, 'missing'), /Workspace not found/);
});

test('getCachedWorkspaceAiReadiness ignores corrupt cache JSON', async () => {
  const { ctx, store } = mockCtx({ workspace: true });
  store.set('workspace-ai-readiness:ws-1', '{not-json');
  const result = await getCachedWorkspaceAiReadiness(ctx, 'ws-1');
  assert.deepEqual(result, { readiness: null });
});
