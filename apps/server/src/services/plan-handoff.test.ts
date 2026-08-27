import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildImplementPlanPrompt,
  buildPlanQaPairsFromAskUserAnswer,
  collectPlanHandoffFilePaths,
  extractAskUserQuestionPairsFromLog,
  extractMentionedFilePathsFromText,
  extractToolFilePathsFromLog,
} from '@agent-orchestrator/shared';
import { extractAskUserQuestionPairsFromEvents } from './plan-handoff.js';

test('buildImplementPlanPrompt includes plan, Q&A, and file paths when provided', () => {
  const prompt = buildImplementPlanPrompt('## Plan\n\nUpdate apps/server/src/services/app.ts', {
    qaPairs: [{ question: 'Which API?', answer: 'REST' }],
    filePaths: ['apps/server/src/services/app.ts', 'packages/shared/src/chat-session.ts'],
  });

  assert.match(prompt, /## Approved plan/);
  assert.match(prompt, /Update apps\/server\/src\/services\/app\.ts/);
  assert.match(prompt, /## Planning Q&A/);
  assert.match(prompt, /Which API\?.*REST/);
  assert.match(prompt, /## Files mentioned/);
  assert.match(prompt, /apps\/server\/src\/services\/app\.ts/);
  assert.match(prompt, /packages\/shared\/src\/chat-session\.ts/);
});

test('buildImplementPlanPrompt omits empty Q&A and file sections', () => {
  const prompt = buildImplementPlanPrompt('Just the plan');
  assert.match(prompt, /## Approved plan/);
  assert.equal(prompt.includes('## Planning Q&A'), false);
  assert.equal(prompt.includes('## Files mentioned'), false);
});

test('extractAskUserQuestionPairsFromLog pairs control_request with control_response', () => {
  const log = [
    JSON.stringify({
      type: 'control_request',
      request_id: 'req-1',
      request: {
        subtype: 'can_use_tool',
        tool_name: 'AskUserQuestion',
        input: {
          questions: [{ question: 'Which stack?', header: 'Stack', options: [{ label: 'REST' }] }],
        },
      },
    }),
    JSON.stringify({
      type: 'control_response',
      response: {
        subtype: 'success',
        request_id: 'req-1',
        response: {
          behavior: 'allow',
          updatedInput: {
            questions: [{ question: 'Which stack?' }],
            answers: { 'Which stack?': 'REST' },
          },
        },
      },
    }),
  ].join('\n');

  const pairs = extractAskUserQuestionPairsFromLog(log);
  assert.deepEqual(pairs, [{ question: 'Which stack?', answer: 'REST' }]);
});

test('extractAskUserQuestionPairsFromEvents uses permission_request plus answered events', () => {
  const events = [
    {
      id: 'e1',
      agentId: 'ag-1',
      type: 'permission_request',
      data: {
        sessionId: 'plan-sess',
        requestId: 'req-1',
        toolName: 'AskUserQuestion',
        input: {
          questions: [{ question: 'Auth mode?', header: 'Auth', options: [{ label: 'Token' }] }],
        },
      },
      createdAt: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'e2',
      agentId: 'ag-1',
      type: 'ask_user_question_answered',
      data: {
        sessionId: 'plan-sess',
        requestId: 'req-1',
        answers: { 'Auth mode?': 'Token' },
      },
      createdAt: '2026-01-01T00:00:01.000Z',
    },
  ];

  assert.deepEqual(extractAskUserQuestionPairsFromEvents(events, 'plan-sess'), [
    { question: 'Auth mode?', answer: 'Token' },
  ]);
});

test('buildPlanQaPairsFromAskUserAnswer supports freeform response', () => {
  const pairs = buildPlanQaPairsFromAskUserAnswer(
    { questions: [{ question: 'Scope?', header: 'Scope', options: [] }] },
    {},
    'Only APIs',
  );
  assert.deepEqual(pairs, [{ question: 'Scope?', answer: 'Only APIs' }]);
});

test('extractMentionedFilePathsFromText finds repo paths in plan markdown', () => {
  const paths = extractMentionedFilePathsFromText(
    'Touch `apps/server/src/services/plan-handoff.ts` and packages/shared/src/chat-session.ts',
  );
  assert.ok(paths.includes('apps/server/src/services/plan-handoff.ts'));
  assert.ok(paths.includes('packages/shared/src/chat-session.ts'));
});

test('extractToolFilePathsFromLog collects file_path tool inputs', () => {
  const log = JSON.stringify({
    type: 'assistant',
    message: {
      content: [{ type: 'tool_use', name: 'Read', input: { file_path: 'src/foo.ts' } }],
    },
  });
  assert.deepEqual(extractToolFilePathsFromLog(log), ['src/foo.ts']);
});

test('collectPlanHandoffFilePaths merges plan text, Q&A, logs, and messages', () => {
  const paths = collectPlanHandoffFilePaths(
    'Edit apps/web/src/pages/Home.tsx',
    [{ question: 'Also update', answer: 'apps/web/src/api/client.ts' }],
  JSON.stringify({ input: { file_path: 'src/ignored-in-text.ts' } }),
    ['Mention src/bar.ts in chat'],
  );
  assert.ok(paths.includes('apps/web/src/pages/Home.tsx'));
  assert.ok(paths.includes('apps/web/src/api/client.ts'));
  assert.ok(paths.includes('src/ignored-in-text.ts'));
  assert.ok(paths.includes('src/bar.ts'));
});
