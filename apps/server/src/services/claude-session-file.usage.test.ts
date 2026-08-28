import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildSessionContextUsage, compactThresholdTokensForWindow } from '@agent-orchestrator/shared';

describe('buildSessionContextUsage', () => {
  it('uses a 200k window for sonnet aliases and a 1M window past 200k occupancy', () => {
    const small = buildSessionContextUsage({
      fallbackModel: 'sonnet',
      history: [
        {
          turn: 1,
          createdAt: null,
          model: 'sonnet',
          usage: {
            inputTokens: 100,
            outputTokens: 10,
            cacheCreationInputTokens: 0,
            cacheReadInputTokens: 1200,
          },
          contextTokens: 1300,
          compacted: false,
          tools: [],
        },
      ],
    });
    assert.equal(small.contextWindowTokens, 200_000);
    assert.equal(small.compactThresholdTokens, 167_000);
    assert.equal(small.currentContextTokens, 1300);
    assert.ok(small.percent != null && small.percent < 1);

    const large = buildSessionContextUsage({
      fallbackModel: 'sonnet',
      history: [
        {
          turn: 1,
          createdAt: null,
          model: 'sonnet',
          usage: {
            inputTokens: 1000,
            outputTokens: 20,
            cacheCreationInputTokens: 0,
            cacheReadInputTokens: 250_000,
          },
          contextTokens: 251_000,
          compacted: false,
          tools: [],
        },
      ],
    });
    assert.equal(large.contextWindowTokens, 1_000_000);
    assert.equal(large.compactThresholdTokens, 967_000);
    assert.ok(large.percent != null && large.percent > 20 && large.percent < 30);
  });

  it('measures percent against the auto-compact threshold, not the raw window', () => {
    const atCompact = buildSessionContextUsage({
      fallbackModel: 'sonnet',
      history: [
        {
          turn: 1,
          createdAt: null,
          model: 'sonnet',
          usage: {
            inputTokens: 167_000,
            outputTokens: 10,
            cacheCreationInputTokens: 0,
            cacheReadInputTokens: 0,
          },
          contextTokens: 167_000,
          compacted: false,
          tools: [],
        },
      ],
    });
    assert.equal(atCompact.compactThresholdTokens, 167_000);
    assert.equal(atCompact.percent, 100);

    const half = buildSessionContextUsage({
      fallbackModel: 'sonnet',
      history: [
        {
          turn: 1,
          createdAt: null,
          model: 'sonnet',
          usage: {
            inputTokens: 83_500,
            outputTokens: 10,
            cacheCreationInputTokens: 0,
            cacheReadInputTokens: 0,
          },
          contextTokens: 83_500,
          compacted: false,
          tools: [],
        },
      ],
    });
    assert.equal(half.percent, 50);
  });

  it('keeps the last real occupancy when a trailing turn reports zero context', () => {
    const usage = buildSessionContextUsage({
      fallbackModel: 'sonnet',
      history: [
        {
          turn: 1,
          createdAt: null,
          model: 'claude-sonnet-4-20250514',
          usage: {
            inputTokens: 200,
            outputTokens: 10,
            cacheCreationInputTokens: 0,
            cacheReadInputTokens: 1800,
          },
          contextTokens: 2000,
          compacted: false,
          tools: [],
        },
        {
          turn: 2,
          createdAt: null,
          model: null,
          usage: {
            inputTokens: 0,
            outputTokens: 8,
            cacheCreationInputTokens: 0,
            cacheReadInputTokens: 0,
          },
          contextTokens: 0,
          compacted: false,
          tools: [],
        },
      ],
    });
    assert.equal(usage.currentContextTokens, 2000);
    assert.equal(usage.usage?.cacheReadInputTokens, 1800);
    assert.equal(usage.model, 'claude-sonnet-4-20250514');
    assert.ok(usage.percent != null && usage.percent > 0);
  });
});

describe('compactThresholdTokensForWindow', () => {
  it('reserves 20k for the compact summary and a 13k buffer', () => {
    assert.equal(compactThresholdTokensForWindow(200_000), 167_000);
    assert.equal(compactThresholdTokensForWindow(1_000_000), 967_000);
  });
});
