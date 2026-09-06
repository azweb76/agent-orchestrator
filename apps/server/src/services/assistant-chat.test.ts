import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type Anthropic from '@anthropic-ai/sdk';
import type { AssistantStreamEvent } from '@agent-orchestrator/shared';
import { createRepositories, initDatabase } from '../db/index.js';
import type { AppContext } from './app-context.js';
import { AnthropicService } from './anthropic.js';
import { ClaudeService, GitService } from './git.js';
import { GitHubService } from './github.js';
import { JiraService } from './jira.js';
import { runAssistantChat, type AssistantModelRound } from './assistant-chat.js';

function makeCtx(tmp: string): AppContext {
  const db = initDatabase(tmp);
  const repos = createRepositories(db);
  return {
    repos,
    git: new GitService(),
    github: new GitHubService({}),
    jira: new JiraService({}),
    claude: new ClaudeService('claude', path.join(tmp, 'runs')),
    anthropic: new AnthropicService(),
    dataDir: tmp,
  };
}

function textRound(text: string): AssistantModelRound {
  return async ({ onToken }) => {
    for (const chunk of text.match(/.{1,4}/g) ?? [text]) {
      onToken(chunk);
    }
    return {
      content: [{ type: 'text', text }] as Anthropic.ContentBlock[],
      stop_reason: 'end_turn',
    };
  };
}

function toolThenTextRound(): AssistantModelRound {
  let calls = 0;
  return async ({ onToken }) => {
    calls += 1;
    if (calls === 1) {
      return {
        content: [
          { type: 'text', text: 'Checking workspaces.' },
          {
            type: 'tool_use',
            id: 'toolu_1',
            name: 'list_workspaces',
            input: {},
          },
        ] as Anthropic.ContentBlock[],
        stop_reason: 'tool_use',
      };
    }
    onToken('You have ');
    onToken('1 workspace.');
    return {
      content: [{ type: 'text', text: 'You have 1 workspace.' }] as Anthropic.ContentBlock[],
      stop_reason: 'end_turn',
    };
  };
}

test('runAssistantChat streams tokens and persists final assistant message', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ao-assistant-chat-'));
  const ctx = makeCtx(tmp);
  const events: AssistantStreamEvent[] = [];

  const result = await runAssistantChat(ctx, 'hello', {
    runModelRound: textRound('Hello there'),
    onEvent: (event) => events.push(event),
  });

  assert.equal(result.messages.length, 2);
  assert.equal(result.messages[0]?.role, 'user');
  assert.equal(result.messages[1]?.role, 'assistant');
  assert.equal(result.messages[1]?.content, 'Hello there');

  assert.equal(events[0]?.type, 'user_message');
  assert.equal(events[1]?.type, 'assistant_start');
  const tokens = events.filter((event) => event.type === 'token');
  assert.ok(tokens.length >= 2);
  assert.equal(events.some((event) => event.type === 'assistant_message'), true);
  assert.equal(events.at(-1)?.type, 'done');

  const stored = ctx.repos.assistantMessages.list();
  assert.equal(stored.length, 2);
  assert.equal(stored[1]?.content, 'Hello there');
});

test('runAssistantChat emits tool_message between tool rounds', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ao-assistant-chat-'));
  const ctx = makeCtx(tmp);
  const events: AssistantStreamEvent[] = [];

  const result = await runAssistantChat(ctx, 'list workspaces', {
    runModelRound: toolThenTextRound(),
    onEvent: (event) => events.push(event),
  });

  assert.ok(result.messages.some((msg) => msg.role === 'tool'));
  assert.ok(events.some((event) => event.type === 'tool_message'));
  assert.equal(events.at(-1)?.type, 'done');
  const assistants = result.messages.filter((msg) => msg.role === 'assistant');
  assert.equal(assistants.length, 2);
  assert.equal(assistants[1]?.content, 'You have 1 workspace.');
});

test('runAssistantChat refuses empty content', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ao-assistant-chat-'));
  const ctx = makeCtx(tmp);
  await assert.rejects(() => runAssistantChat(ctx, '   '), /Message is required/);
});
