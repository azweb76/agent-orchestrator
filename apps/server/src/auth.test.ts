import assert from 'node:assert/strict';
import test from 'node:test';
import { authCookieHeader, optionalBearerAuth, readPresentedAuthToken, tokensMatch } from './auth.js';

test('readPresentedAuthToken prefers the Bearer header', () => {
  const token = readPresentedAuthToken({
    headers: { authorization: 'Bearer secret', cookie: 'ao_token=cookie' },
  });
  assert.equal(token, 'secret');
});

test('readPresentedAuthToken falls back to the cookie', () => {
  assert.equal(
    readPresentedAuthToken({
      headers: { cookie: 'other=1; ao_token=from-cookie' },
    }),
    'from-cookie',
  );
  assert.equal(readPresentedAuthToken({ headers: {} }), undefined);
});

test('tokensMatch compares without leaking length or prefix', () => {
  assert.equal(tokensMatch('expected', 'expected'), true);
  assert.equal(tokensMatch('expecteX', 'expected'), false);
  assert.equal(tokensMatch('short', 'expected'), false);
  assert.equal(tokensMatch('expected-and-then-some', 'expected'), false);
  assert.equal(tokensMatch(undefined, 'expected'), false);
  assert.equal(tokensMatch('', 'expected'), false);
});

test('authCookieHeader is HttpOnly and adds Secure only over TLS', () => {
  const plain = authCookieHeader('tok en', false);
  assert.match(plain, /^ao_token=tok%20en; Path=\/; SameSite=Lax; HttpOnly$/);
  assert.match(authCookieHeader('t', true), /; Secure$/);
});

test('optionalBearerAuth is a no-op when AUTH_TOKEN is unset', () => {
  const mw = optionalBearerAuth(undefined);
  let called = false;
  mw({} as never, {} as never, () => {
    called = true;
  });
  assert.equal(called, true);
});

test('optionalBearerAuth rejects missing or wrong tokens', () => {
  const mw = optionalBearerAuth('expected');
  const calls: Array<{ status: number; body: unknown }> = [];
  const res = {
    status(code: number) {
      const result = {
        json(body: unknown) {
          calls.push({ status: code, body });
        },
      };
      return result;
    },
  };

  mw({ headers: {}, query: {} } as never, res as never, () => {
    throw new Error('should not continue');
  });
  mw(
    { headers: { authorization: 'Bearer nope' }, query: {} } as never,
    res as never,
    () => {
      throw new Error('should not continue');
    },
  );

  assert.equal(calls.length, 2);
  assert.equal(calls[0]?.status, 401);
  assert.deepEqual(calls[1]?.body, { error: 'Unauthorized', authRequired: true });
});

test('optionalBearerAuth accepts a matching bearer token', () => {
  const mw = optionalBearerAuth('expected');
  let called = false;
  mw(
    { headers: { authorization: 'Bearer expected' }, query: {} } as never,
    {} as never,
    () => {
      called = true;
    },
  );
  assert.equal(called, true);
});
