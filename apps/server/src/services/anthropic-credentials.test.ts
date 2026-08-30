import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
  CLAUDE_OAUTH_BETA,
  createAnthropicClient,
  resolveAnthropicAuth,
} from './anthropic-credentials.js';

async function withTempHome(
  setup: (home: string) => Promise<void>,
  run: (home: string) => Promise<void>,
): Promise<void> {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'ao-anthropic-creds-'));
  try {
    await setup(home);
    await run(home);
  } finally {
    await fs.rm(home, { recursive: true, force: true });
  }
}

test('resolveAnthropicAuth prefers ANTHROPIC_AUTH_TOKEN over API key', async () => {
  await withTempHome(
    async () => {},
    async (home) => {
      const auth = await resolveAnthropicAuth(home, {
        ANTHROPIC_AUTH_TOKEN: 'sk-ant-oat01-from-env',
        ANTHROPIC_API_KEY: 'sk-ant-api03-from-env',
      });
      assert.deepEqual(auth, {
        mode: 'authToken',
        authToken: 'sk-ant-oat01-from-env',
        baseUrl: undefined,
      });
    },
  );
});

test('resolveAnthropicAuth uses ANTHROPIC_API_KEY when no auth token', async () => {
  await withTempHome(
    async () => {},
    async (home) => {
      const auth = await resolveAnthropicAuth(home, {
        ANTHROPIC_API_KEY: 'sk-ant-api03-from-env',
      });
      assert.deepEqual(auth, {
        mode: 'apiKey',
        apiKey: 'sk-ant-api03-from-env',
        baseUrl: undefined,
      });
    },
  );
});

test('resolveAnthropicAuth reads ~/.claude/.api_key', async () => {
  await withTempHome(
    async (home) => {
      const claudeDir = path.join(home, '.claude');
      await fs.mkdir(claudeDir, { recursive: true });
      await fs.writeFile(path.join(claudeDir, '.api_key'), 'sk-ant-api03-file\n');
    },
    async (home) => {
      const auth = await resolveAnthropicAuth(home, {});
      assert.deepEqual(auth, {
        mode: 'apiKey',
        apiKey: 'sk-ant-api03-file',
        baseUrl: undefined,
      });
    },
  );
});

test('resolveAnthropicAuth reads Claude Code OAuth from .credentials.json', async () => {
  await withTempHome(
    async (home) => {
      const claudeDir = path.join(home, '.claude');
      await fs.mkdir(claudeDir, { recursive: true });
      await fs.writeFile(
        path.join(claudeDir, '.credentials.json'),
        JSON.stringify({
          claudeAiOauth: {
            accessToken: 'sk-ant-oat01-stored',
            expiresAt: Date.now() + 60_000,
          },
        }),
      );
    },
    async (home) => {
      const auth = await resolveAnthropicAuth(home, {});
      assert.deepEqual(auth, {
        mode: 'authToken',
        authToken: 'sk-ant-oat01-stored',
      });
    },
  );
});

test('resolveAnthropicAuth ignores expired Claude Code OAuth credentials', async () => {
  await withTempHome(
    async (home) => {
      const claudeDir = path.join(home, '.claude');
      await fs.mkdir(claudeDir, { recursive: true });
      await fs.writeFile(
        path.join(claudeDir, '.credentials.json'),
        JSON.stringify({
          claudeAiOauth: {
            accessToken: 'sk-ant-oat01-expired',
            expiresAt: Date.now() - 1_000,
          },
        }),
      );
    },
    async (home) => {
      await assert.rejects(
        () => resolveAnthropicAuth(home, {}),
        /Unable to resolve Anthropic credentials/,
      );
    },
  );
});

test('resolveAnthropicAuth applies apiBaseUrl from settings', async () => {
  await withTempHome(
    async (home) => {
      const claudeDir = path.join(home, '.claude');
      await fs.mkdir(claudeDir, { recursive: true });
      await fs.writeFile(
        path.join(claudeDir, 'settings.json'),
        JSON.stringify({ apiBaseUrl: 'https://gateway.example/v1' }),
      );
      await fs.writeFile(path.join(claudeDir, '.api_key'), 'sk-ant-api03-file');
    },
    async (home) => {
      const auth = await resolveAnthropicAuth(home, {});
      assert.equal(auth.mode, 'apiKey');
      assert.equal(auth.baseUrl, 'https://gateway.example/v1');
    },
  );
});

test('createAnthropicClient uses Bearer auth and OAuth beta for auth tokens', () => {
  const client = createAnthropicClient({
    mode: 'authToken',
    authToken: 'sk-ant-oat01-test',
  });
  assert.equal(client.authToken, 'sk-ant-oat01-test');
  assert.equal(client.apiKey, null);
  assert.equal(CLAUDE_OAUTH_BETA, 'oauth-2025-04-20');
});

test('createAnthropicClient uses api key mode without forcing OAuth headers path', () => {
  const client = createAnthropicClient({
    mode: 'apiKey',
    apiKey: 'sk-ant-api03-test',
  });
  assert.equal(client.apiKey, 'sk-ant-api03-test');
});
