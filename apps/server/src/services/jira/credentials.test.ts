import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolveJiraApiToken } from './credentials.js';

test('resolveJiraApiToken prefers JIRA_API_TOKEN over keychain', () => {
  const token = resolveJiraApiToken(
    { JIRA_API_TOKEN: 'env-token' },
    () => 'keychain-token',
  );
  assert.equal(token, 'env-token');
});

test('resolveJiraApiToken trims env token', () => {
  const token = resolveJiraApiToken({ JIRA_API_TOKEN: '  env-token  ' }, () => 'keychain-token');
  assert.equal(token, 'env-token');
});

test('resolveJiraApiToken falls back to keychain when env is empty', () => {
  const token = resolveJiraApiToken({ JIRA_API_TOKEN: '   ' }, () => 'keychain-token');
  assert.equal(token, 'keychain-token');
});

test('resolveJiraApiToken falls back to keychain when env is unset', () => {
  const token = resolveJiraApiToken({}, () => 'keychain-token');
  assert.equal(token, 'keychain-token');
});

test('resolveJiraApiToken returns undefined when neither source has a token', () => {
  const token = resolveJiraApiToken({}, () => null);
  assert.equal(token, undefined);
});
