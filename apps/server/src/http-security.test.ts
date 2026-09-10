import assert from 'node:assert/strict';
import test from 'node:test';
import { checkSecureBind, hostGuard, isLoopbackHost, securityHeaders } from './http-security.js';

function collectRes() {
  const calls: Array<{ status: number; body: unknown }> = [];
  const headers = new Map<string, string>();
  const res = {
    status(code: number) {
      return {
        json(body: unknown) {
          calls.push({ status: code, body });
        },
      };
    },
    setHeader(name: string, value: string) {
      headers.set(name, value);
    },
  };
  return { calls, headers, res };
}

test('isLoopbackHost recognises the loopback forms', () => {
  for (const host of ['127.0.0.1', 'localhost', '::1', '[::1]', 'LOCALHOST']) {
    assert.equal(isLoopbackHost(host), true, host);
  }
  for (const host of ['0.0.0.0', '192.168.1.10', 'example.com']) {
    assert.equal(isLoopbackHost(host), false, host);
  }
});

test('securityHeaders sets CSP and sniffing protections', () => {
  const { headers, res } = collectRes();
  let called = false;
  securityHeaders()({} as never, res as never, () => {
    called = true;
  });
  assert.equal(called, true);
  assert.equal(headers.get('X-Content-Type-Options'), 'nosniff');
  assert.equal(headers.get('X-Frame-Options'), 'DENY');
  assert.match(headers.get('Content-Security-Policy') ?? '', /default-src 'self'/);
  assert.match(headers.get('Content-Security-Policy') ?? '', /frame-ancestors 'none'/);
});

test('hostGuard allows loopback Host headers with and without a port', () => {
  const mw = hostGuard('127.0.0.1');
  for (const host of ['localhost:3001', '127.0.0.1:3001', '127.0.0.1', '[::1]:3001']) {
    let called = false;
    mw({ headers: { host } } as never, collectRes().res as never, () => {
      called = true;
    });
    assert.equal(called, true, host);
  }
});

test('hostGuard rejects a foreign Host header on a loopback bind', () => {
  const mw = hostGuard('127.0.0.1');
  const { calls, res } = collectRes();
  mw({ headers: { host: 'attacker.example:3001' } } as never, res as never, () => {
    throw new Error('should not continue');
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.status, 403);
});

test('hostGuard rejects a missing Host header', () => {
  const { calls, res } = collectRes();
  hostGuard('127.0.0.1')({ headers: {} } as never, res as never, () => {
    throw new Error('should not continue');
  });
  assert.equal(calls[0]?.status, 400);
});

test('hostGuard honours an explicit extra host', () => {
  let called = false;
  hostGuard('127.0.0.1', ['dev.local'])(
    { headers: { host: 'dev.local:3001' } } as never,
    collectRes().res as never,
    () => {
      called = true;
    },
  );
  assert.equal(called, true);
});

test('hostGuard is a no-op for a non-loopback bind', () => {
  let called = false;
  hostGuard('0.0.0.0')({ headers: { host: 'anything.example' } } as never, collectRes().res as never, () => {
    called = true;
  });
  assert.equal(called, true);
});

test('checkSecureBind allows loopback without a token', () => {
  assert.equal(checkSecureBind('127.0.0.1', undefined, false).ok, true);
});

test('checkSecureBind refuses a non-loopback bind without a token', () => {
  const result = checkSecureBind('0.0.0.0', undefined, false);
  assert.equal(result.ok, false);
  assert.match(result.message ?? '', /AUTH_TOKEN/);
});

test('checkSecureBind allows a non-loopback bind with a token or an override', () => {
  assert.equal(checkSecureBind('0.0.0.0', 'secret', false).ok, true);
  assert.equal(checkSecureBind('0.0.0.0', undefined, true).ok, true);
});
