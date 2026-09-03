import assert from 'node:assert/strict';
import test from 'node:test';
import { buildJiraKickoffPrompt, parseJiraIssueKey } from '@agent-orchestrator/shared';
import { adfToPlainText, normalizeDescription } from './jira.js';
import { JiraService } from './jira.js';

test('parseJiraIssueKey reads bare keys and browse URLs', () => {
  assert.equal(parseJiraIssueKey('eng-42'), 'ENG-42');
  assert.equal(parseJiraIssueKey('https://acme.atlassian.net/browse/ENG-99'), 'ENG-99');
  assert.equal(parseJiraIssueKey('owner/repo#12'), null);
});

test('buildJiraKickoffPrompt includes key, summary, source, and comments', () => {
  const prompt = buildJiraKickoffPrompt(
    {
      key: 'ENG-9',
      summary: 'Fix login',
      description: 'Broken OAuth.',
      htmlUrl: 'https://acme.atlassian.net/browse/ENG-9',
    },
    [{ authorDisplayName: 'Ada', body: 'Repro on staging.' }],
  );
  assert.match(prompt, /^# ENG-9: Fix login/);
  assert.match(prompt, /Broken OAuth/);
  assert.match(prompt, /### Ada/);
});

test('adfToPlainText flattens common ADF nodes', () => {
  const text = adfToPlainText({
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'Hello' }],
      },
      {
        type: 'bulletList',
        content: [
          {
            type: 'listItem',
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: 'Item' }],
              },
            ],
          },
        ],
      },
    ],
  });
  assert.match(text, /Hello/);
  assert.match(text, /- Item/);
  assert.equal(normalizeDescription('plain'), 'plain');
  assert.equal(normalizeDescription(null), '');
});

test('JiraService listAssignedOpenIssues uses search/jql and maps fields', async () => {
  const previousFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    if (url.includes('/rest/api/3/search/jql')) {
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            issues: [
              {
                id: '10001',
                key: 'ENG-7',
                fields: {
                  summary: 'Ship Jira support',
                  description: {
                    type: 'doc',
                    content: [
                      {
                        type: 'paragraph',
                        content: [{ type: 'text', text: 'Wire the API token.' }],
                      },
                    ],
                  },
                  status: { name: 'In Progress' },
                  issuetype: { name: 'Task' },
                  project: { key: 'ENG', name: 'Engineering' },
                  reporter: { displayName: 'Dan' },
                  updated: '2026-09-03T12:00:00.000Z',
                },
              },
            ],
          }),
      } as Response;
    }
    throw new Error(`unexpected fetch: ${url}`);
  }) as typeof fetch;

  try {
    const jira = new JiraService({
      baseUrl: 'https://acme.atlassian.net',
      email: 'dan@example.com',
      apiToken: 'token',
    });
    assert.equal(jira.isConfigured(), true);
    const issues = await jira.listAssignedOpenIssues();
    assert.equal(issues.length, 1);
    assert.equal(issues[0]?.key, 'ENG-7');
    assert.equal(issues[0]?.summary, 'Ship Jira support');
    assert.equal(issues[0]?.description, 'Wire the API token.');
    assert.equal(issues[0]?.htmlUrl, 'https://acme.atlassian.net/browse/ENG-7');
    assert.equal(issues[0]?.reporterDisplayName, 'Dan');
    assert.match(calls[0] ?? '', /search\/jql/);
    assert.match(calls[0] ?? '', /assignee%20%3D%20currentUser/);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('JiraService getIssueDetail loads issue and comments', async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/comment')) {
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            comments: [
              {
                id: '1',
                created: '2026-09-03T13:00:00.000Z',
                author: { displayName: 'Ada' },
                body: 'Looks good.',
              },
            ],
          }),
      } as Response;
    }
    if (url.includes('/rest/api/3/issue/ENG-7')) {
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            id: '10001',
            key: 'ENG-7',
            fields: {
              summary: 'Ship Jira support',
              description: 'Wire the API token.',
              status: { name: 'To Do' },
              issuetype: { name: 'Story' },
              project: { key: 'ENG', name: 'Engineering' },
              reporter: { displayName: 'Dan' },
              updated: '2026-09-03T12:00:00.000Z',
            },
          }),
      } as Response;
    }
    throw new Error(`unexpected fetch: ${url}`);
  }) as typeof fetch;

  try {
    const jira = new JiraService({
      baseUrl: 'https://acme.atlassian.net/',
      email: 'dan@example.com',
      apiToken: 'token',
    });
    const detail = await jira.getIssueDetail('eng-7');
    assert.equal(detail.key, 'ENG-7');
    assert.equal(detail.comments.length, 1);
    assert.equal(detail.comments[0]?.body, 'Looks good.');
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('JiraService rejects missing credentials', async () => {
  const jira = new JiraService({});
  assert.equal(jira.isConfigured(), false);
  await assert.rejects(() => jira.listAssignedOpenIssues(), /Jira is not configured/);
});
