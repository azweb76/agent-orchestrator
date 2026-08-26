import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { buildSessionContextUsage, compactThresholdTokensForWindow } from '@agent-orchestrator/shared';
import {
  encodeClaudeProjectDir,
  parseClaudeSessionContext,
  parseClaudeSessionFile,
  resolveClaudeSessionFilePath,
} from './claude-session-file.js';

const tmpDirs: string[] = [];

function tmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ao-session-file-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('claude session file path', () => {
  it('encodes a working directory by replacing non-alphanumerics', () => {
    assert.equal(encodeClaudeProjectDir('/Users/dan/code/app'), '-Users-dan-code-app');
    assert.equal(encodeClaudeProjectDir('/data/wt-feat'), '-data-wt-feat');
  });

  it('finds a JSONL at the canonical Claude projects path', () => {
    const root = tmpDir();
    const cwd = path.join(root, 'wt');
    const configDir = path.join(root, 'claude');
    const sessionId = 'sess-abc';
    const filePath = path.join(
      configDir,
      'projects',
      encodeClaudeProjectDir(cwd),
      `${sessionId}.jsonl`,
    );
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, '{}\n');

    assert.equal(
      resolveClaudeSessionFilePath({ cwd, sessionId, configDir }),
      filePath,
    );
  });

  it('finds a JSONL under a nested sessions directory', () => {
    const root = tmpDir();
    const cwd = path.join(root, 'repo');
    const configDir = path.join(root, 'claude');
    const sessionId = 'sess-nested';
    const filePath = path.join(
      configDir,
      'projects',
      encodeClaudeProjectDir(cwd),
      'sessions',
      `${sessionId}.jsonl`,
    );
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, '{}\n');

    assert.equal(
      resolveClaudeSessionFilePath({ cwd, sessionId, configDir }),
      filePath,
    );
  });

  it('finds a JSONL in another project directory by session id', () => {
    const root = tmpDir();
    const cwd = path.join(root, 'current-wt');
    const configDir = path.join(root, 'claude');
    const sessionId = 'sess-moved';
    const filePath = path.join(configDir, 'projects', '-some-other-project', `${sessionId}.jsonl`);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, '{}\n');

    assert.equal(
      resolveClaudeSessionFilePath({ cwd, sessionId, configDir }),
      filePath,
    );
  });

  it('prefers the Claude JSONL over the orchestrator run log', () => {
    const root = tmpDir();
    const cwd = path.join(root, 'wt');
    const configDir = path.join(root, 'claude');
    const sessionId = 'sess-prefer';
    const jsonl = path.join(
      configDir,
      'projects',
      encodeClaudeProjectDir(cwd),
      `${sessionId}.jsonl`,
    );
    const runLog = path.join(root, 'runs', 'sess-1.log');
    fs.mkdirSync(path.dirname(jsonl), { recursive: true });
    fs.mkdirSync(path.dirname(runLog), { recursive: true });
    fs.writeFileSync(jsonl, '{}\n');
    fs.writeFileSync(runLog, '{}\n');

    assert.equal(
      resolveClaudeSessionFilePath({ cwd, sessionId, runLogPath: runLog, configDir }),
      jsonl,
    );
  });

  it('falls back to the run log when no JSONL exists', () => {
    const root = tmpDir();
    const runLog = path.join(root, 'runs', 'sess-1-1.log');
    fs.mkdirSync(path.dirname(runLog), { recursive: true });
    fs.writeFileSync(runLog, '{}\n');

    assert.equal(
      resolveClaudeSessionFilePath({
        cwd: path.join(root, 'wt'),
        sessionId: 'missing',
        runLogPath: runLog,
        configDir: path.join(root, 'claude'),
      }),
      runLog,
    );
  });

  it('returns null when neither the JSONL nor the run log exists', () => {
    const root = tmpDir();
    assert.equal(
      resolveClaudeSessionFilePath({
        cwd: path.join(root, 'wt'),
        sessionId: 'nope',
        runLogPath: path.join(root, 'missing.log'),
        configDir: path.join(root, 'claude'),
      }),
      null,
    );
  });
});

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
});

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
});

describe('compactThresholdTokensForWindow', () => {
  it('reserves 20k for the compact summary and a 13k buffer', () => {
    assert.equal(compactThresholdTokensForWindow(200_000), 167_000);
    assert.equal(compactThresholdTokensForWindow(1_000_000), 967_000);
  });
});