import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isClaudeCliCommand,
  isNoiseCommand,
  mergeClaudeProcesses,
  parsePsOutput,
  type OwnedRunMeta,
  type RawProcessRow,
} from './claude-process-list.js';

test('parsePsOutput reads pid, ppid, and command', () => {
  const rows = parsePsOutput(`
  101  1 /Users/dan/.local/bin/claude --print --output-format stream-json
  202  1 claude
  303  1 node -e "setInterval(() => {}, 1 << 30)" /tmp/x.stdin
`);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[0], {
    pid: 101,
    ppid: 1,
    command: '/Users/dan/.local/bin/claude --print --output-format stream-json',
  });
  assert.equal(rows[1]?.pid, 202);
  assert.equal(rows[2]?.command.includes('setInterval'), true);
});

test('isNoiseCommand filters grep and stdin holders', () => {
  assert.equal(isNoiseCommand('rg claude'), true);
  assert.equal(isNoiseCommand('grep claude'), true);
  assert.equal(
    isNoiseCommand(
      '/usr/bin/node -e const fs = require(\'fs\'); const fd = fs.openSync(process.argv[1], \'r+\'); setInterval(() => {}, 1 << 30); /tmp/run.stdin',
    ),
    true,
  );
  assert.equal(isNoiseCommand('claude --print'), false);
});

test('isClaudeCliCommand matches basename and configured bin paths', () => {
  const bins = new Set(['/opt/claude']);
  assert.equal(isClaudeCliCommand('claude --print', bins), true);
  assert.equal(isClaudeCliCommand('/usr/local/bin/claude --resume abc', bins), true);
  assert.equal(isClaudeCliCommand('/opt/claude --print', bins), true);
  assert.equal(isClaudeCliCommand('rg claude', bins), false);
  assert.equal(isClaudeCliCommand('python /tmp/claude.py', bins), false);
});

test('mergeClaudeProcesses marks ownership by PID and includes alive owned misses', () => {
  const psRows: RawProcessRow[] = [
    { pid: 10, ppid: 1, command: 'claude --print --output-format stream-json' },
    { pid: 20, ppid: 1, command: 'claude' },
    { pid: 99, ppid: 1, command: 'rg claude' },
  ];
  const ownedByPid = new Map<number, OwnedRunMeta>([
    [
      10,
      {
        sessionId: 'sess-1',
        agentId: 'ag-1',
        agentName: 'Fix login',
        workspaceName: 'demo',
      },
    ],
    [
      30,
      {
        sessionId: 'sess-2',
        agentId: 'ag-2',
        agentName: 'Odd path',
        workspaceName: 'demo',
      },
    ],
  ]);

  const result = mergeClaudeProcesses({
    psRows,
    claudeBinPaths: new Set(),
    ownedByPid,
    resolveCwd: (pid) => (pid === 20 ? '/tmp/external' : pid === 10 ? '/tmp/ours' : null),
    isAlive: (pid) => pid === 30,
  });

  assert.equal(result.length, 3);

  const owned = result.find((p) => p.pid === 10);
  assert.ok(owned);
  assert.equal(owned.ownership, 'orchestrator');
  assert.equal(owned.agentId, 'ag-1');
  assert.equal(owned.agentName, 'Fix login');
  assert.equal(owned.workspaceName, 'demo');
  assert.equal(owned.cwd, '/tmp/ours');

  const external = result.find((p) => p.pid === 20);
  assert.ok(external);
  assert.equal(external.ownership, 'external');
  assert.equal(external.agentId, null);
  assert.equal(external.cwd, '/tmp/external');

  const safety = result.find((p) => p.pid === 30);
  assert.ok(safety);
  assert.equal(safety.ownership, 'orchestrator');
  assert.equal(safety.agentName, 'Odd path');
  assert.match(safety.command, /orchestrator-tracked/);

  assert.equal(result.some((p) => p.pid === 99), false);
  assert.equal(result[0]?.ownership, 'orchestrator');
});

test('mergeClaudeProcesses skips dead owned PIDs not in ps', () => {
  const result = mergeClaudeProcesses({
    psRows: [],
    claudeBinPaths: new Set(),
    ownedByPid: new Map([
      [
        44,
        {
          sessionId: 'sess',
          agentId: 'ag',
          agentName: 'Gone',
          workspaceName: 'ws',
        },
      ],
    ]),
    resolveCwd: () => null,
    isAlive: () => false,
  });
  assert.deepEqual(result, []);
});
