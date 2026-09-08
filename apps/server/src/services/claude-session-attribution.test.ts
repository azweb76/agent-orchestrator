import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildContextAttribution,
  emptyAttributionChars,
} from '@agent-orchestrator/shared';
import { parseClaudeSessionContext } from './claude-session-file.js';

describe('parseClaudeSessionContext attribution', () => {
  it('classifies conversation, tool results, skills, and instruction reads', () => {
    const parsed = parseClaudeSessionContext(
      [
        JSON.stringify({
          type: 'user',
          message: { role: 'user', content: 'Please fix the flaky retries now.' },
        }),
        JSON.stringify({
          type: 'assistant',
          message: {
            content: [
              { type: 'text', text: 'Reading files and a skill' },
              { type: 'tool_use', id: '1', name: 'Read', input: { file_path: 'src/retry.ts' } },
              { type: 'tool_use', id: '2', name: 'Skill', input: { skill: 'retry-tests' } },
              { type: 'tool_use', id: '3', name: 'Read', input: { file_path: 'CLAUDE.md' } },
            ],
            usage: { input_tokens: 2000, output_tokens: 20, cache_read_input_tokens: 8000 },
          },
        }),
        JSON.stringify({
          type: 'user',
          message: {
            content: [
              {
                type: 'tool_result',
                tool_use_id: '1',
                content: 'export function retry() { return 1; }\n'.repeat(40),
              },
              {
                type: 'tool_result',
                tool_use_id: '2',
                content: '# retry-tests\nAlways rerun failing tests twice.\n'.repeat(20),
              },
              {
                type: 'tool_result',
                tool_use_id: '3',
                content: '# CLAUDE.md\nProject conventions live here.\n'.repeat(15),
              },
            ],
          },
        }),
      ].join('\n'),
    );

    assert.ok(parsed.attributionChars.conversation > 0);
    assert.ok(parsed.attributionChars.tool_results > parsed.attributionChars.conversation);
    assert.ok(parsed.attributionChars.skills > 0);
    assert.ok(parsed.attributionChars.instruction_files > 0);
  });

  it('resets classified chars after compact_boundary', () => {
    const parsed = parseClaudeSessionContext(
      [
        JSON.stringify({
          type: 'user',
          message: { content: 'Huge prompt that should disappear after compact. '.repeat(50) },
        }),
        JSON.stringify({ type: 'system', subtype: 'compact_boundary' }),
        JSON.stringify({
          type: 'assistant',
          message: {
            content: [{ type: 'text', text: 'After compact' }],
            usage: { input_tokens: 400, output_tokens: 10, cache_read_input_tokens: 900 },
          },
        }),
      ].join('\n'),
    );

    assert.equal(parsed.attributionChars.conversation, 'After compact'.length);
  });

  it('skips nested subagent events', () => {
    const parsed = parseClaudeSessionContext(
      [
        JSON.stringify({
          type: 'assistant',
          message: {
            content: [
              { type: 'text', text: 'Parent' },
              {
                type: 'tool_use',
                id: 'nested-1',
                name: 'Task',
                input: { subagent_type: 'Explore', description: 'Explore' },
              },
            ],
            usage: { input_tokens: 100, output_tokens: 10, cache_read_input_tokens: 900 },
          },
        }),
        JSON.stringify({
          type: 'assistant',
          parent_tool_use_id: 'nested-1',
          message: {
            content: [{ type: 'text', text: 'Enormous nested transcript '.repeat(80) }],
            usage: { input_tokens: 5000, output_tokens: 40 },
          },
        }),
      ].join('\n'),
    );

    assert.ok(parsed.attributionChars.conversation < 200);
  });
});

describe('buildContextAttribution', () => {
  it('puts remainder occupancy in other and names the largest cut', () => {
    const chars = emptyAttributionChars();
    chars.tool_results = 4000;
    chars.conversation = 400;
    const attribution = buildContextAttribution(chars, 10_000);
    assert.ok(attribution);
    assert.equal(attribution.largest, 'other');
    assert.match(attribution.cutHint ?? '', /unparsed system prompt/i);
    const total = attribution.buckets.reduce((sum, bucket) => sum + bucket.tokens, 0);
    assert.equal(total, 10_000);
  });

  it('scales down when estimates exceed occupancy', () => {
    const chars = emptyAttributionChars();
    chars.skills = 40_000;
    const attribution = buildContextAttribution(chars, 1000);
    assert.equal(attribution?.largest, 'skills');
    assert.match(attribution?.cutHint ?? '', /bloated skill/i);
    const skills = attribution?.buckets.find((bucket) => bucket.key === 'skills')?.tokens ?? 0;
    assert.equal(skills, 1000);
  });
});
