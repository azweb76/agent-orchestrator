import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';
import { encodeClaudeProjectDir, resolveClaudeSessionFilePath } from './claude-session-file.js';
import { tmpDir } from './claude-session-file.test-helpers.js';

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
