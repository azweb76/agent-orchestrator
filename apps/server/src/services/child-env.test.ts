import assert from 'node:assert/strict';
import test from 'node:test';
import { childEnv, strippedEnvKeys } from './child-env.js';

function withEnv(values: Record<string, string>, run: () => void): void {
  const saved = new Map<string, string | undefined>();
  for (const key of Object.keys(values)) {
    saved.set(key, process.env[key]);
    process.env[key] = values[key]!;
  }
  try {
    run();
  } finally {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test('childEnv drops every orchestrator secret', () => {
  const secrets = Object.fromEntries(strippedEnvKeys().map((key) => [key, `value-for-${key}`]));
  withEnv(secrets, () => {
    const env = childEnv();
    for (const key of strippedEnvKeys()) {
      assert.equal(env[key], undefined, key);
    }
    // Nothing should survive by value either.
    const serialized = JSON.stringify(env);
    for (const key of strippedEnvKeys()) {
      assert.equal(serialized.includes(`value-for-${key}`), false, key);
    }
  });
});

test('childEnv keeps the variables Claude Code and the CLI need', () => {
  withEnv(
    {
      PATH: '/usr/bin',
      HOME: '/home/someone',
      CLAUDE_CONFIG_DIR: '/home/someone/.claude-alt',
      ANTHROPIC_BASE_URL: 'https://example.invalid',
      HTTPS_PROXY: 'http://proxy.invalid:3128',
      NODE_EXTRA_CA_CERTS: '/etc/ca.pem',
    },
    () => {
      const env = childEnv();
      assert.equal(env.PATH, '/usr/bin');
      assert.equal(env.HOME, '/home/someone');
      // The server resolves session files from wherever the child writes them.
      assert.equal(env.CLAUDE_CONFIG_DIR, '/home/someone/.claude-alt');
      assert.equal(env.ANTHROPIC_BASE_URL, 'https://example.invalid');
      assert.equal(env.HTTPS_PROXY, 'http://proxy.invalid:3128');
      assert.equal(env.NODE_EXTRA_CA_CERTS, '/etc/ca.pem');
    },
  );
});

test('childEnv merges extra values and does not mutate process.env', () => {
  withEnv({ GITHUB_TOKEN: 'secret' }, () => {
    const env = childEnv({ CI: 'true' });
    assert.equal(env.CI, 'true');
    assert.equal(env.GITHUB_TOKEN, undefined);
    assert.equal(process.env.GITHUB_TOKEN, 'secret');
  });
});

test('extra values cannot reintroduce a stripped key', () => {
  const env = childEnv({ AUTH_TOKEN: 'sneaky' });
  assert.equal(env.AUTH_TOKEN, undefined);
});
