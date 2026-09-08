import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { GitHubService } from './github-service.js';
import { jsonResponse } from '../github.test-helpers.js';

describe('github contents', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('lists blob paths from the git tree', async () => {
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/git/trees/')) {
        return jsonResponse({
          tree: [
            { path: '.claude/skills/plan-work/SKILL.md', type: 'blob' },
            { path: '.claude/skills/plan-work', type: 'tree' },
          ],
        });
      }
      throw new Error(`unexpected ${url}`);
    }) as typeof fetch;

    const github = new GitHubService({ token: 't' });
    const paths = await github.listRepoFilePaths('acme', 'demo', 'main');
    assert.deepEqual(paths, ['.claude/skills/plan-work/SKILL.md']);
  });

  it('decodes base64 file contents', async () => {
    globalThis.fetch = (async () =>
      jsonResponse({
        type: 'file',
        encoding: 'base64',
        size: 12,
        content: Buffer.from('# Hello\n').toString('base64'),
      })) as typeof fetch;

    const github = new GitHubService({ token: 't' });
    const text = await github.readRepoFileText('acme', 'demo', '.claude/skills/a/SKILL.md', 'main');
    assert.equal(text, '# Hello\n');
  });
});
