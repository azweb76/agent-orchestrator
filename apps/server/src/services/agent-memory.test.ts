import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatMemoriesForSystemPrompt,
  mergeSystemPromptWithMemories,
  rankAgentMemories,
  type AgentMemory,
} from '@agent-orchestrator/shared';

function memory(partial: Partial<AgentMemory> & Pick<AgentMemory, 'id' | 'key' | 'content'>): AgentMemory {
  return {
    scope: 'agent',
    workspaceId: 'ws-1',
    agentId: 'ag-1',
    kind: 'fact',
    source: 'user',
    sourceSessionId: null,
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  };
}

test('rankAgentMemories prefers preferences then lessons then newer facts', () => {
  const ranked = rankAgentMemories([
    memory({ id: '1', key: 'f', content: 'fact', kind: 'fact', updatedAt: '2026-01-01T00:00:00.000Z' }),
    memory({ id: '2', key: 'p', content: 'pref', kind: 'preference', updatedAt: '2026-01-01T00:00:00.000Z' }),
    memory({ id: '3', key: 'l', content: 'lesson', kind: 'lesson', updatedAt: '2026-01-02T00:00:00.000Z' }),
    memory({ id: '4', key: 'f2', content: 'newer', kind: 'fact', updatedAt: '2026-01-03T00:00:00.000Z' }),
  ]);
  assert.deepEqual(
    ranked.map((item) => item.id),
    ['2', '3', '4', '1'],
  );
});

test('formatMemoriesForSystemPrompt skips archived and respects max chars', () => {
  const block = formatMemoriesForSystemPrompt(
    [
      memory({ id: '1', key: 'pref.tests', content: 'Use vitest', kind: 'preference' }),
      memory({
        id: '2',
        key: 'archived',
        content: 'gone',
        status: 'archived',
      }),
      memory({
        id: '3',
        key: 'huge',
        content: 'x'.repeat(5000),
        kind: 'fact',
      }),
    ],
    200,
  );
  assert.match(block, /Orchestrator memory/);
  assert.match(block, /pref\.tests/);
  assert.doesNotMatch(block, /archived/);
  assert.ok(block.length <= 200);
});

test('mergeSystemPromptWithMemories concatenates base and memory block', () => {
  assert.equal(mergeSystemPromptWithMemories(null, ''), null);
  assert.equal(mergeSystemPromptWithMemories('Be brief.', ''), 'Be brief.');
  assert.equal(mergeSystemPromptWithMemories('', '## Memory'), '## Memory');
  assert.equal(
    mergeSystemPromptWithMemories('Be brief.', '## Memory'),
    'Be brief.\n\n## Memory',
  );
});
