import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRepositories, initDatabase } from '../db/index.js';
import {
  readJiraWorkspaceMap,
  rememberJiraWorkspace,
  suggestWorkspaceForJiraProject,
} from './jira-issues.js';
import type { AppContext } from './app-context.js';

function makeCtx(): AppContext {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ao-jira-ws-'));
  const db = initDatabase(dir);
  const repos = createRepositories(db);
  repos.workspaces.create({
    id: 'ws-1',
    name: 'eng-service',
    repoUrl: 'https://github.com/acme/eng-service',
    repoPath: path.join(dir, 'eng-service'),
    defaultBranch: 'main',
    githubOwner: 'acme',
    githubRepo: 'eng-service',
    createdAt: new Date().toISOString(),
  });
  return {
    repos,
    dataDir: dir,
  } as AppContext;
}

test('suggestWorkspaceForJiraProject matches repo containing project key', () => {
  const ctx = makeCtx();
  assert.equal(suggestWorkspaceForJiraProject(ctx, 'ENG'), 'ws-1');
});

test('rememberJiraWorkspace persists and is preferred', () => {
  const ctx = makeCtx();
  ctx.repos.workspaces.create({
    id: 'ws-2',
    name: 'other',
    repoUrl: 'https://github.com/acme/other',
    repoPath: path.join(ctx.dataDir, 'other'),
    defaultBranch: 'main',
    githubOwner: 'acme',
    githubRepo: 'other',
    createdAt: new Date().toISOString(),
  });
  rememberJiraWorkspace(ctx, 'ENG', 'ws-2');
  assert.deepEqual(readJiraWorkspaceMap(ctx), { ENG: 'ws-2' });
  assert.equal(suggestWorkspaceForJiraProject(ctx, 'ENG'), 'ws-2');
});
