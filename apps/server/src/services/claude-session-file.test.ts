import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';
import {
  encodeClaudeProjectDir,
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
