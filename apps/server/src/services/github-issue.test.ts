import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildIssueKickoffPrompt, parseIssueReference } from '@agent-orchestrator/shared';

test('parseIssueReference reads owner/repo#n and GitHub issue URLs', () => {
  assert.deepEqual(parseIssueReference('azweb76/agent-orchestrator#149'), {
    owner: 'azweb76',
    repo: 'agent-orchestrator',
    number: 149,
  });
  assert.deepEqual(
    parseIssueReference('https://github.com/azweb76/agent-orchestrator/issues/152'),
    { owner: 'azweb76', repo: 'agent-orchestrator', number: 152 },
  );
  assert.equal(parseIssueReference('https://github.com/azweb76/agent-orchestrator/pull/42'), null);
  assert.equal(parseIssueReference('fix login'), null);
});

test('buildIssueKickoffPrompt includes title, body, source, and comments', () => {
  const prompt = buildIssueKickoffPrompt(
    { title: 'Add inbox', body: 'Please add issue inbox.', htmlUrl: 'https://github.com/o/r/issues/1' },
    [{ authorLogin: 'dan', body: 'Also show labels.' }],
  );

  assert.match(prompt, /# Add inbox/);
  assert.match(prompt, /Please add issue inbox/);
  assert.match(prompt, /https:\/\/github\.com\/o\/r\/issues\/1/);
  assert.match(prompt, /### dan/);
});
