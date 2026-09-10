import assert from 'node:assert/strict';
import test from 'node:test';
import { parseGitHubUrl } from './repo-slug.js';

test('parseGitHubUrl accepts the forms the app actually uses', () => {
  const cases: Array<[string, string, string]> = [
    ['https://github.com/acme/widgets', 'acme', 'widgets'],
    ['https://github.com/acme/widgets.git', 'acme', 'widgets'],
    ['https://github.com/acme/widgets/', 'acme', 'widgets'],
    ['github.com/acme/widgets', 'acme', 'widgets'],
    ['git@github.com:acme/widgets.git', 'acme', 'widgets'],
    ['ssh://git@github.com/acme/widgets.git', 'acme', 'widgets'],
    ['https://www.github.com/acme/widgets', 'acme', 'widgets'],
  ];
  for (const [input, owner, repo] of cases) {
    assert.deepEqual(parseGitHubUrl(input), { owner, repo }, input);
  }
});

test('parseGitHubUrl is anchored to the host, not a substring match', () => {
  // The old unanchored regex accepted all of these.
  for (const input of [
    'https://elsewhere.example/github.com/acme/widgets',
    'https://github.com.elsewhere.example/acme/widgets',
    'git@notgithub.com:acme/widgets.git',
    'https://elsewhere.example/?u=github.com/acme/widgets',
  ]) {
    assert.throws(() => parseGitHubUrl(input), /Invalid GitHub repository URL/, input);
  }
});

test('parseGitHubUrl rejects a leading dash and junk', () => {
  for (const input of ['--upload-pack=x', '-o', '', '   ', 'github.com/acme', 'not a url']) {
    assert.throws(() => parseGitHubUrl(input), /Invalid GitHub repository URL/, JSON.stringify(input));
  }
});
