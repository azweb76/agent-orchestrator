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
import { JiraService } from '../services/jira.js';
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
      jira: new JiraService({}),
      claude: {
        checkInstalled: async () => false,
        getBin: () => 'claude',
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

test('GET /api/status returns system readiness fields', async () => {
  await withServer(async (url) => {
    const res = await fetch(`${url}/api/status`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as {
      claudeInstalled: boolean;
      anthropicConfigured: boolean;
      githubTokenConfigured: boolean;
      githubLogin: string | null;
      jiraConfigured: boolean;
      jiraDisplayName: string | null;
      archivedAgentCount: number;
      dataDirBytes?: number;
    };
    assert.equal(body.claudeInstalled, false);
    assert.equal(typeof body.anthropicConfigured, 'boolean');
    assert.equal(body.githubTokenConfigured, false);
    assert.equal(body.githubLogin, null);
    assert.equal(body.jiraConfigured, false);
    assert.equal(body.jiraDisplayName, null);
    assert.equal(body.archivedAgentCount, 0);
    assert.equal(body.dataDirBytes, undefined);
  });
});

test('POST /api/setup/claude-auth probes Claude login', async () => {
  await withServer(async (url) => {
    const res = await fetch(`${url}/api/setup/claude-auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.ok(res.status === 200 || res.status === 400);
    const body = (await res.json()) as { loggedIn?: boolean; ok?: boolean; error?: string };
    if (res.status === 200) {
      assert.equal(body.ok, true);
      assert.equal(body.loggedIn, true);
    } else {
      assert.equal(body.loggedIn, false);
      assert.match(String(body.error), /not logged in/i);
    }
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

test('GET /api/claude/processes returns an array', async () => {
  await withServer(async (url) => {
    const res = await fetch(`${url}/api/claude/processes`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body));
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

// #87: endpoints removed after #74 dropped their web client callers. Unrouted
// paths skip the JSON error handler, so Express answers with its HTML 404.
test('dead endpoints from #74 are no longer routed', async () => {
  await withServer(async (url) => {
    const removed = [
      { method: 'GET', path: '/api/agents/ag-1/events' },
      { method: 'GET', path: '/api/agents/ag-1/sessions' },
      { method: 'POST', path: '/api/workspaces/ws-1/worktrees/suggest-branch-name' },
    ];
    for (const { method, path: routePath } of removed) {
      const res = await fetch(`${url}${routePath}`, { method });
      assert.equal(res.status, 404, `${method} ${routePath}`);
      assert.match(
        res.headers.get('content-type') ?? '',
        /text\/html/,
        `${method} ${routePath} should fall through to the default 404`,
      );
    }
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

test('PUT /api/task-followups accepts the built-in grade-session kind', async () => {
  await withServer(async (url) => {
    // Listing seeds the built-in catalog, which includes a grade-session follow-up.
    const listRes = await fetch(`${url}/api/task-followups`);
    assert.equal(listRes.status, 200);
    const followUps = (await listRes.json()) as Array<{ id: string; name: string; kind: string }>;
    const gradeSession = followUps.find((item) => item.name === 'grade-session');
    assert.ok(gradeSession, 'expected a seeded grade-session follow-up');

    // The Brain edit form always sends `kind`, so this is the exact shape it PUTs.
    const res = await fetch(`${url}/api/task-followups/${gradeSession.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Grade this session', kind: 'grade-session' }),
    });
    assert.equal(res.status, 200);
    const updated = (await res.json()) as { title: string; kind: string };
    assert.equal(updated.title, 'Grade this session');
    assert.equal(updated.kind, 'grade-session');
  });
});

test('PUT /api/task-followups persists the exit-plan-mode trigger', async () => {
  await withServer(async (url) => {
    const followUps = (await (await fetch(`${url}/api/task-followups`)).json()) as Array<{
      id: string;
      name: string;
    }>;
    const target = followUps.find((item) => item.name === 'continue');
    assert.ok(target, 'expected a seeded continue follow-up');

    const res = await fetch(`${url}/api/task-followups/${target.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trigger: 'exit-plan-mode' }),
    });
    assert.equal(res.status, 200);

    const reread = (await (await fetch(`${url}/api/task-followups/${target.id}`)).json()) as {
      trigger: string;
    };
    assert.equal(reread.trigger, 'exit-plan-mode');
  });
});
