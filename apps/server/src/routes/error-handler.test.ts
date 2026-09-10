import assert from 'node:assert/strict';
import test from 'node:test';
import { z } from 'zod';
import { errorHandler } from './error-handler.js';

interface Captured {
  status?: number;
  body?: Record<string, unknown>;
  written: string[];
  ended: boolean;
}

function fakeReqRes(options: { headersSent?: boolean; contentType?: string } = {}) {
  const captured: Captured = { written: [], ended: false };
  const res = {
    headersSent: options.headersSent ?? false,
    getHeader: (_name: string) => options.contentType,
    status(code: number) {
      captured.status = code;
      return {
        json(body: Record<string, unknown>) {
          captured.body = body;
        },
      };
    },
    write(chunk: string) {
      captured.written.push(chunk);
    },
    end() {
      captured.ended = true;
    },
  };
  const req = { method: 'GET', originalUrl: '/api/thing' };
  return { captured, req, res };
}

// Errors are logged deliberately; keep the suite output quiet.
function silenceConsole(): () => void {
  const original = console.error;
  console.error = () => {};
  return () => {
    console.error = original;
  };
}

test('validation errors still return 400 with issues', () => {
  const { captured, req, res } = fakeReqRes();
  const error = new z.ZodError([]);
  errorHandler(error, req as never, res as never, (() => {}) as never);
  assert.equal(captured.status, 400);
  assert.equal(captured.body?.error, 'Validation error');
});

test('a safe not-found message keeps its 404 and text', () => {
  const restore = silenceConsole();
  const { captured, req, res } = fakeReqRes();
  errorHandler(new Error('Workspace not found'), req as never, res as never, (() => {}) as never);
  restore();
  assert.equal(captured.status, 404);
  assert.equal(captured.body?.error, 'Workspace not found');
  assert.equal(typeof captured.body?.correlationId, 'string');
});

test('an execFile rejection does not echo the command line or remote URL', () => {
  const restore = silenceConsole();
  const { captured, req, res } = fakeReqRes();
  const error = new Error(
    'Command failed: git clone https://token@github.com/acme/repo.git /Users/someone/data/repos/x',
  );
  errorHandler(error, req as never, res as never, (() => {}) as never);
  restore();
  assert.equal(captured.status, 500);
  assert.equal(captured.body?.error, 'Internal server error');
  const serialized = JSON.stringify(captured.body);
  assert.equal(serialized.includes('github.com'), false);
  assert.equal(serialized.includes('/Users/'), false);
  assert.equal(serialized.includes('git clone'), false);
});

test('a multi-line or path-bearing message is withheld even if it says not found', () => {
  const restore = silenceConsole();
  for (const message of [
    'ENOENT: no such file or directory /Users/x/data/runs/a.log',
    'Worktree not found\n  at Object.<anonymous> (/app/dist/index.js:1:1)',
  ]) {
    const { captured, req, res } = fakeReqRes();
    errorHandler(new Error(message), req as never, res as never, (() => {}) as never);
    assert.equal(captured.body?.error, 'Internal server error', message);
    assert.equal(captured.status, 500);
  }
  restore();
});

test('after headers are sent it ends the response instead of throwing', () => {
  const restore = silenceConsole();
  const { captured, req, res } = fakeReqRes({
    headersSent: true,
    contentType: 'text/event-stream',
  });
  errorHandler(new Error('late failure'), req as never, res as never, (() => {}) as never);
  restore();
  assert.equal(captured.status, undefined);
  assert.equal(captured.ended, true);
  assert.equal(captured.written.length, 1);
  assert.match(captured.written[0] ?? '', /^event: error\ndata: /);
});

test('a non-SSE response that already sent headers just ends', () => {
  const restore = silenceConsole();
  const { captured, req, res } = fakeReqRes({ headersSent: true, contentType: 'application/json' });
  errorHandler(new Error('late failure'), req as never, res as never, (() => {}) as never);
  restore();
  assert.equal(captured.ended, true);
  assert.equal(captured.written.length, 0);
});
