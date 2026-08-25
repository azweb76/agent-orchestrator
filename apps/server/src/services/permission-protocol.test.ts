import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildControlResponse,
  isClaudePlanFileTool,
  isInteractivePermissionTool,
  parsePermissionRequest,
  shouldAutoAllowToolPermission,
} from './permission-protocol.js';
import {
  buildAskUserQuestionUpdatedInput,
  extractPlanFilePathsFromLog,
  extractPlanFromInput,
  isClaudePlansPath,
  parseAskUserQuestions,
} from '@agent-orchestrator/shared';

test('parsePermissionRequest handles can_use_tool control_request', () => {
  const parsed = parsePermissionRequest({
    type: 'control_request',
    request_id: 'req-1',
    request: {
      subtype: 'can_use_tool',
      tool_name: 'AskUserQuestion',
      input: {
        questions: [
          {
            question: 'Which approach?',
            header: 'Approach',
            options: [{ label: 'A', description: 'Option A' }],
            multiSelect: false,
          },
        ],
      },
    },
  });
  assert.ok(parsed);
  assert.equal(parsed.requestId, 'req-1');
  assert.equal(parsed.toolName, 'AskUserQuestion');
  assert.equal(parseAskUserQuestions(parsed.input).length, 1);
});

test('parsePermissionRequest handles sdk_control_request permission subtype with tool_input', () => {
  const parsed = parsePermissionRequest({
    type: 'sdk_control_request',
    request: {
      subtype: 'permission',
      request_id: 'perm-9',
      tool_name: 'Bash',
      tool_input: { command: 'ls' },
      toolUseId: 'toolu_1',
    },
  });
  assert.ok(parsed);
  assert.equal(parsed.requestId, 'perm-9');
  assert.equal(parsed.toolName, 'Bash');
  assert.deepEqual(parsed.input, { command: 'ls' });
  assert.equal(parsed.toolUseId, 'toolu_1');
});

test('parsePermissionRequest handles ExitPlanMode with plan', () => {
  const parsed = parsePermissionRequest({
    type: 'control_request',
    request_id: 'req-2',
    request: {
      subtype: 'can_use_tool',
      tool_name: 'ExitPlanMode',
      input: { plan: '# Plan\n\nDo the thing.' },
    },
  });
  assert.ok(parsed);
  assert.equal(parsed.toolName, 'ExitPlanMode');
  assert.equal(extractPlanFromInput(parsed.input), '# Plan\n\nDo the thing.');
});

test('parsePermissionRequest handles ExitPlanMode with empty V2 input', () => {
  const parsed = parsePermissionRequest({
    type: 'control_request',
    request_id: '733fbf9e',
    request: {
      subtype: 'can_use_tool',
      tool_name: 'ExitPlanMode',
      input: {},
    },
  });
  assert.ok(parsed);
  assert.equal(parsed.toolName, 'ExitPlanMode');
  assert.equal(extractPlanFromInput(parsed.input), '');
});

test('isInteractivePermissionTool only flags AskUserQuestion and ExitPlanMode', () => {
  assert.equal(isInteractivePermissionTool('AskUserQuestion'), true);
  assert.equal(isInteractivePermissionTool('ExitPlanMode'), true);
  assert.equal(isInteractivePermissionTool('Bash'), false);
});

test('shouldAutoAllowToolPermission auto-allows writes to Claude plan files', () => {
  assert.equal(
    shouldAutoAllowToolPermission('Write', 'plan', {
      file_path: '/home/user/.claude/plans/bold-eagle.md',
    }),
    true,
  );
  assert.equal(
    shouldAutoAllowToolPermission('Edit', 'plan', {
      file_path: '/home/user/.claude/plans/bold-eagle.md',
    }),
    true,
  );
  assert.equal(
    shouldAutoAllowToolPermission('Write', 'plan', { file_path: '/workspace/src/app.ts' }),
    false,
  );
  assert.equal(isClaudePlanFileTool('Write', { file_path: '/tmp/notes.md' }), false);
  assert.equal(isClaudePlansPath('/home/user/.claude/plans/bold-eagle.md'), true);
});

test('extractPlanFilePathsFromLog finds Write targets under .claude/plans', () => {
  const log = [
    JSON.stringify({
      type: 'assistant',
      message: {
        content: [
          {
            type: 'tool_use',
            name: 'Write',
            input: { file_path: '/home/user/.claude/plans/swift-river.md', content: '# Plan' },
          },
        ],
      },
    }),
    JSON.stringify({
      type: 'assistant',
      message: {
        content: [
          {
            type: 'tool_use',
            name: 'Write',
            input: { file_path: '/workspace/README.md', content: 'nope' },
          },
        ],
      },
    }),
  ].join('\n');
  assert.deepEqual(extractPlanFilePathsFromLog(log), ['/home/user/.claude/plans/swift-river.md']);
});

test('buildControlResponse allow includes updatedInput', () => {
  const payload = buildControlResponse('req-3', {
    behavior: 'allow',
    updatedInput: { answers: { Q: 'A' } },
  });
  assert.equal(payload.type, 'control_response');
  const response = payload.response as Record<string, unknown>;
  assert.equal(response.request_id, 'req-3');
  const inner = response.response as Record<string, unknown>;
  assert.equal(inner.behavior, 'allow');
  assert.deepEqual(inner.updatedInput, { answers: { Q: 'A' } });
});

test('buildControlResponse deny includes message', () => {
  const payload = buildControlResponse('req-4', {
    behavior: 'deny',
    message: 'Keep planning',
  });
  const response = payload.response as Record<string, unknown>;
  const inner = response.response as Record<string, unknown>;
  assert.equal(inner.behavior, 'deny');
  assert.equal(inner.message, 'Keep planning');
});

test('parseAskUserQuestions supports multiple questions', () => {
  const questions = parseAskUserQuestions({
    questions: [
      {
        question: 'Format?',
        header: 'Format',
        options: [
          { label: 'Summary', description: 'Brief' },
          { label: 'Detailed', description: 'Full' },
        ],
        multiSelect: false,
      },
      {
        question: 'Sections?',
        header: 'Sections',
        options: [
          { label: 'Intro', description: 'Opening' },
          { label: 'Outro', description: 'Closing' },
        ],
        multiSelect: true,
      },
    ],
  });
  assert.equal(questions.length, 2);
  assert.equal(questions[0]?.multiSelect, false);
  assert.equal(questions[1]?.multiSelect, true);
  assert.equal(questions[1]?.options.length, 2);
});

test('buildAskUserQuestionUpdatedInput echoes original questions and answers', () => {
  const originalQuestions = [
    {
      question: 'How should I format the output?',
      header: 'Format',
      options: [
        { label: 'Summary', description: 'Brief' },
        { label: 'Detailed', description: 'Full' },
      ],
      multiSelect: false,
    },
  ];
  const pendingInput = {
    questions: originalQuestions,
    metadata: { source: 'test' },
  };

  const updated = buildAskUserQuestionUpdatedInput(pendingInput, {
    answers: { 'How should I format the output?': 'Summary' },
  });

  assert.equal(updated.questions, originalQuestions);
  assert.deepEqual(updated.answers, { 'How should I format the output?': 'Summary' });
  assert.deepEqual(updated.metadata, { source: 'test' });
  assert.equal(updated.response, undefined);
});

test('buildAskUserQuestionUpdatedInput supports freeform response', () => {
  const pendingInput = { questions: [{ question: 'Q?', header: 'Q', options: [], multiSelect: false }] };
  const updated = buildAskUserQuestionUpdatedInput(pendingInput, {
    answers: {},
    response: '  Just use defaults  ',
  });
  assert.equal(updated.questions, pendingInput.questions);
  assert.deepEqual(updated.answers, {});
  assert.equal(updated.response, 'Just use defaults');
});
