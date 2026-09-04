import assert from 'node:assert/strict';
import test from 'node:test';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { initDatabase, createRepositories } from '../db/index.js';
import type { AppContext } from './app-context.js';
import {
  cachePrStatusFromDetail,
  getCachedPrStatus,
  setCachedPrStatus,
} from './pr-status-cache.js';

function makeCtx(tmp: string): AppContext {
  const db = initDatabase(tmp);
  const repos = createRepositories(db);
  return { db, repos, dataDir: tmp } as unknown as AppContext;
}

test('cachePrStatusFromDetail stores merged snapshot for sidebar delivery phase', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pr-status-cache-'));
  try {
    const ctx = makeCtx(tmp);
    assert.equal(getCachedPrStatus(ctx, 'acme', 'demo', 12), null);

    const snap = cachePrStatusFromDetail(ctx, 'acme', 'demo', {
      number: 12,
      state: 'closed',
      draft: false,
      merged: true,
      mergeable: null,
      mergeableState: 'unknown',
      reviewCommentCount: 0,
    });

    assert.equal(snap.merged, true);
    assert.equal(snap.state, 'closed');
    assert.equal(snap.checksRollup, 'none');
    assert.equal(getCachedPrStatus(ctx, 'acme', 'demo', 12)?.merged, true);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('setCachedPrStatus round-trips open PR checks', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pr-status-cache-'));
  try {
    const ctx = makeCtx(tmp);
    setCachedPrStatus(ctx, 'acme', 'demo', 3, {
      state: 'open',
      draft: true,
      merged: false,
      checksRollup: 'pending',
      updatedAt: '2026-01-01T00:00:00.000Z',
      checksFailing: 0,
    });
    const snap = getCachedPrStatus(ctx, 'acme', 'demo', 3);
    assert.equal(snap?.draft, true);
    assert.equal(snap?.checksRollup, 'pending');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
