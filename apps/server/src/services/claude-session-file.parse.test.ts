import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseClaudeSessionContext, parseClaudeSessionFile } from './claude-session-file.js';

describe('parseClaudeSessionFile', () => {
  it('extracts turns, tools, skills, usage, and cost from a Claude JSONL file', () => {
    const parsed = parseClaudeSessionFile(
      [
        JSON.stringify({ type: 'system', subtype: 'init' }),
        JSON.stringify({
          type: 'user',
          message: { role: 'user', content: 'Fix the flaky retries' },
        }),
        JSON.stringify({
          type: 'assistant',
          message: {
            content: [
              { type: 'text', text: 'Reading the test file' },
              { type: 'tool_use', id: '1', name: 'Read', input: { file_path: 'src/retry.ts' } },
              { type: 'tool_use', id: '2', name: 'Skill', input: { skill: 'retry-tests' } },
            ],
            usage: { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 5 },
          },
        }),
        JSON.stringify({
          type: 'user',
          message: { content: [{ type: 'tool_result', tool_use_id: '1', content: 'ok' }] },
        }),
        JSON.stringify({ type: 'result', total_cost_usd: 0.25 }),
        '',
      ].join('\n'),
    );

    assert.equal(parsed.messages.length, 2);
    assert.equal(parsed.messages[0]?.role, 'user');
    assert.equal(parsed.messages[0]?.content, 'Fix the flaky retries');
    assert.equal(parsed.messages[1]?.role, 'assistant');
    assert.match(parsed.messages[1]?.content ?? '', /Reading the test file/);
    assert.equal(parsed.usageTokens, 125);
    assert.equal(parsed.costUsd, 0.25);
    const tools = parsed.messages[1]?.metadata?.timeline?.filter((part) => part.type === 'tool');
    assert.deepEqual(
      tools?.map((part) => (part.type === 'tool' ? { name: part.name, detail: part.detail } : null)),
      [
        { name: 'Read', detail: 'src/retry.ts' },
        { name: 'Skill', detail: 'retry-tests' },
      ],
    );
  });

  it('skips stream_event snapshots and duplicate assistant payloads', () => {
    const assistant = {
      type: 'assistant',
      message: { content: [{ type: 'text', text: 'Done' }] },
    };
    const parsed = parseClaudeSessionFile(
      [
        JSON.stringify({ type: 'stream_event', event: { type: 'text_delta', delta: { text: 'Do' } } }),
        JSON.stringify(assistant),
        JSON.stringify(assistant),
        '',
      ].join('\n'),
    );
    assert.equal(parsed.messages.length, 1);
    assert.equal(parsed.messages[0]?.content, 'Done');
  });
});

describe('parseClaudeSessionContext', () => {
  it('tracks per-turn context size, cache buckets, compact, and skips nested subagents', () => {
    const parsed = parseClaudeSessionContext(
      [
        JSON.stringify({
          type: 'system',
          subtype: 'init',
          model: 'claude-sonnet-4-20250514',
        }),
        JSON.stringify({
          type: 'assistant',
          timestamp: '2026-08-26T12:00:00.000Z',
          message: {
            model: 'claude-sonnet-4-20250514',
            content: [
              { type: 'text', text: 'Reading files' },
              { type: 'tool_use', id: '1', name: 'Read', input: { file_path: 'src/a.ts' } },
            ],
            usage: {
              input_tokens: 1200,
              output_tokens: 80,
              cache_creation_input_tokens: 8000,
              cache_read_input_tokens: 20000,
            },
          },
        }),
        JSON.stringify({
          type: 'assistant',
          parent_tool_use_id: 'nested-1',
          message: {
            content: [{ type: 'text', text: 'subagent' }],
            usage: { input_tokens: 500, output_tokens: 40 },
          },
        }),
        JSON.stringify({ type: 'system', subtype: 'compact_boundary' }),
        JSON.stringify({
          type: 'assistant',
          timestamp: 1756202400,
          message: {
            content: [{ type: 'text', text: 'After compact' }],
            usage: {
              input_tokens: 400,
              output_tokens: 60,
              cache_read_input_tokens: 9000,
            },
          },
        }),
        JSON.stringify({ type: 'result', total_cost_usd: 0.42 }),
        '',
      ].join('\n'),
    );

    assert.equal(parsed.model, 'claude-sonnet-4-20250514');
    assert.equal(parsed.costUsd, 0.42);
    assert.equal(parsed.history.length, 2);
    assert.equal(parsed.history[0]?.contextTokens, 29200);
    assert.equal(parsed.history[0]?.compacted, false);
    assert.deepEqual(parsed.history[0]?.tools, ['Read']);
    assert.equal(parsed.history[1]?.contextTokens, 9400);
    assert.equal(parsed.history[1]?.compacted, true);
    assert.equal(parsed.billed.inputTokens, 1600);
    assert.equal(parsed.billed.cacheReadInputTokens, 29000);
    assert.equal(parsed.billed.outputTokens, 140);
  });

  it('uses result usage when assistant messages have none', () => {
    const parsed = parseClaudeSessionContext(
      JSON.stringify({
        type: 'result',
        total_cost_usd: 0.1,
        usage: { input_tokens: 50, output_tokens: 10, cache_read_input_tokens: 200 },
      }),
    );
    assert.equal(parsed.history.length, 1);
    assert.equal(parsed.history[0]?.contextTokens, 250);
    assert.equal(parsed.billed.outputTokens, 10);
  });

  it('ignores output-only interrupted stubs so context does not drop to zero', () => {
    const parsed = parseClaudeSessionContext(
      [
        JSON.stringify({
          type: 'assistant',
          message: {
            model: 'claude-sonnet-4-20250514',
            content: [{ type: 'text', text: 'Working' }],
            usage: {
              input_tokens: 100,
              output_tokens: 20,
              cache_read_input_tokens: 4000,
            },
          },
        }),
        JSON.stringify({
          type: 'assistant',
          message: {
            content: [{ type: 'text', text: 'partial' }],
            usage: { input_tokens: 0, output_tokens: 12 },
          },
        }),
        JSON.stringify({
          type: 'result',
          usage: { input_tokens: 0, output_tokens: 12 },
        }),
        '',
      ].join('\n'),
    );

    assert.equal(parsed.history.length, 1);
    assert.equal(parsed.history[0]?.contextTokens, 4100);
    assert.equal(parsed.model, 'claude-sonnet-4-20250514');
  });
});
