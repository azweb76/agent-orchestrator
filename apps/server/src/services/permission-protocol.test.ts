import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildControlResponse,
  isInteractivePermissionTool,
  parsePermissionRequest,
  shouldAutoAllowToolPermission,
} from './permission-protocol.js';
import { extractPlanFromInput, parseAskUserQuestions } from '@agent-orchestrator/shared';

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

test('isInteractivePermissionTool only flags AskUserQuestion and ExitPlanMode', () => {
  assert.equal(isInteractivePermissionTool('AskUserQuestion'), true);
  assert.equal(isInteractivePermissionTool('ExitPlanMode'), true);
  assert.equal(isInteractivePermissionTool('Bash'), false);
});

test('shouldAutoAllowToolPermission never auto-allows interactive tools', () => {
  assert.equal(shouldAutoAllowToolPermission('AskUserQuestion', 'auto'), false);
  assert.equal(shouldAutoAllowToolPermission('ExitPlanMode', 'plan'), false);
  assert.equal(shouldAutoAllowToolPermission('Bash', 'default'), false);
  assert.equal(shouldAutoAllowToolPermission('Bash', 'auto'), true);
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
