import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import test from 'node:test';
import { createRepositories, initDatabase } from '../db/index.js';
import type { AppContext } from '../services/app.js';
import { AnthropicService } from '../services/anthropic.js';
import { ClaudeService, GitService } from '../services/git.js';
import { GitHubService } from '../services/github.js';
import { Notifier } from '../services/notifier.js';
import { createRouter, errorHandler } from './index.js';

async function withServer(
  fn: (url: string, ctx: AppContext) => Promise<void>,
): Promise<void> {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ao-router-'));
  try {
    const db = initDatabase(tmp);
    const ctx: AppContext = {
      repos: createRepositories(db),
      git: new GitService(),
      github: new GitHubService({}),
      claude: {
        checkInstalled: async () => false,
        releaseAll: () => undefined,
        stop: () => true,
      } as unknown as ClaudeService,
      anthropic: {} as AnthropicService,
      dataDir: tmp,
      notifier: new Notifier(),
    };

    const app = express();
    app.use(express.json());
    app.use('/api', createRouter(ctx));
    app.use(errorHandler);

    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('no listen port');
    const url = `http://127.0.0.1:${address.port}`;
    try {
      await fn(url, ctx);
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      );
    }
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
}

test('GET /api/status returns system fields including disk usage', async () => {
  await withServer(async (url) => {
    const res = await fetch(`${url}/api/status`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      claudeInstalled: boolean;
      githubTokenConfigured: boolean;
      githubLogin: string | null;
      archivedAgentCount: number;
      dataDirBytes: number;
    };
    assert.equal(body.claudeInstalled, false);
    assert.equal(body.githubTokenConfigured, false);
    assert.equal(body.githubLogin, null);
    assert.equal(body.archivedAgentCount, 0);
    assert.equal(typeof body.dataDirBytes, 'number');
  });
});

test('GET /api/usage returns an empty rollup', async () => {
  await withServer(async (url) => {
    const res = await fetch(`${url}/api/usage`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as { totalCostUsd: number; agents: unknown[] };
    assert.equal(body.totalCostUsd, 0);
    assert.deepEqual(body.agents, []);
  });
});

test('GET /api/sidebar returns an empty tree', async () => {
  await withServer(async (url) => {
    const res = await fetch(`${url}/api/sidebar`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), []);
  });
});

test('POST /api/workspaces rejects an invalid body', async () => {
  await withServer(async (url) => {
    const res = await fetch(`${url}/api/workspaces`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 400);
    const body = (await res.json()) as { error: string };
    assert.equal(body.error, 'Validation error');
  });
});

test('GET unknown agent returns 404', async () => {
  await withServer(async (url) => {
    const res = await fetch(`${url}/api/agents/missing`);
    assert.equal(res.status, 404);
    const body = (await res.json()) as { error: string };
    assert.match(body.error, /not found/i);
  });
});

test('POST review with a missing body for REQUEST_CHANGES is a 400', async () => {
  await withServer(async (url) => {
    const res = await fetch(`${url}/api/github/repos/ex/demo/pulls/1/reviews`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'REQUEST_CHANGES' }),
    });
    assert.equal(res.status, 400);
    const body = (await res.json()) as { error: string };
    assert.equal(body.error, 'Validation error');
  });
});
