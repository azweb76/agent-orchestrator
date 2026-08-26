import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Message, SlashCommand } from '@agent-orchestrator/shared';
import {
  buildSessionGradeContext,
  buildSessionGradePrompt,
  collectUsedSkills,
  parseSessionGradeResponse,
} from './session-grade.js';
import type { InstructionFileExcerpt } from './instruction-files.js';

function msg(
  role: Message['role'],
  content: string,
  extras?: Partial<Message>,
): Message {
  return {
    id: extras?.id ?? `${role}-${content.slice(0, 12)}`,
    agentId: 'ag-1',
    sessionId: 'sess-1',
    role,
    content,
    attachments: [],
    metadata: extras?.metadata ?? {},
    createdAt: extras?.createdAt ?? '2026-01-01T00:00:00.000Z',
  };
}

const files: InstructionFileExcerpt[] = [
  {
    kind: 'claude_md',
    scope: 'project',
    name: 'CLAUDE.md',
    description: 'Project agent instructions',
    relativePath: 'CLAUDE.md',
    exists: true,
    charCount: 4000,
    excerpt: '# Huge CLAUDE.md\nAlways paste the entire repo.',
  },
  {
    kind: 'agents_md',
    scope: 'project',
    name: 'AGENTS.md',
    description: 'Project agent instruction file',
    relativePath: 'AGENTS.md',
    exists: false,
    charCount: 0,
    excerpt: '',
  },
];

const skills: SlashCommand[] = [
  { command: '/retry-tests', description: 'Re-run tests after retries', kind: 'skill', source: 'project' },
  { command: '/code-review', description: 'Review the current diff', kind: 'skill', source: 'bundled' },
];

describe('session grade analysis', () => {
  it('counts turns, tools, cost, and instruction tokens', () => {
    const context = buildSessionGradeContext({
      messages: [
        msg('user', 'Fix retries'),
        msg('assistant', 'Looking around', {
          metadata: {
            costUsd: 0.12,
            timeline: [
              { type: 'tool', id: 't1', name: 'Read', detail: 'src/a.ts', status: 'done' },
              { type: 'tool', id: 't2', name: 'Read', detail: 'src/b.ts', status: 'done' },
              { type: 'text', id: 'x', text: 'done' },
            ],
          },
        }),
        msg('user', '/retry-tests please'),
        msg('assistant', 'Used the skill', {
          metadata: {
            costUsd: 0.08,
            timeline: [{ type: 'tool', id: 't3', name: 'Skill', detail: 'retry-tests', status: 'done' }],
          },
        }),
      ],
      instructionFiles: files,
      skills,
      sessionTitle: 'Chat',
      model: 'sonnet',
      permissionMode: 'plan',
    });

    assert.equal(context.stats.userTurns, 2);
    assert.equal(context.stats.assistantTurns, 2);
    assert.equal(context.stats.toolCalls, 3);
    assert.equal(context.stats.costUsd, 0.2);
    assert.equal(context.stats.instructionFileCount, 1);
    assert.equal(context.stats.skillCount, 2);
    assert.ok(context.stats.estimatedTokens > 1000);
    assert.deepEqual(context.usedSkills, ['/retry-tests']);
    assert.deepEqual(context.tools, [
      { name: 'Read', count: 2 },
      { name: 'Skill', count: 1 },
    ]);
  });

  it('detects slash-command skill use from user text', () => {
    const used = collectUsedSkills(
      [msg('user', '/code-review the diff')],
      skills,
    );
    assert.deepEqual(used, ['/code-review']);
  });

  it('builds a prompt covering the five analysis areas', () => {
    const context = buildSessionGradeContext({
      messages: [msg('user', 'Add retry logic'), msg('assistant', 'I skipped the tests.')],
      instructionFiles: files,
      skills,
      sessionTitle: 'Retries',
      model: 'sonnet',
      permissionMode: 'auto',
      notes: 'Be strict about tests',
    });
    const { system, user } = buildSessionGradePrompt(context);
    assert.match(system, /excessive turns/i);
    assert.match(system, /wasted tokens/i);
    assert.match(system, /bloated context/i);
    assert.match(system, /instruction files/i);
    assert.match(system, /missing or weak skills/i);
    assert.match(user, /Be strict about tests/);
    assert.match(user, /CLAUDE.md/);
    assert.match(user, /\/retry-tests/);
    assert.match(user, /Add retry logic/);
    assert.match(system, /submit_session_grade/);
  });

  it('parses fenced JSON and fills missing finding categories', () => {
    const raw = `\`\`\`json
{
  "score": 2,
  "summary": "Too many turns and no test skill.",
  "findings": [
    { "category": "excessive_turns", "severity": "issue", "title": "Eight retries", "detail": "The user restated the same ask." },
    { "category": "skills", "severity": "warning", "title": "No retry skill", "detail": "A skill would have helped." }
  ]
}
\`\`\``;
    const parsed = parseSessionGradeResponse(raw, {
      userTurns: 8,
      assistantTurns: 8,
      estimatedTokens: 12000,
      costUsd: 1.2,
      toolCalls: 20,
      instructionFileCount: 1,
      skillCount: 2,
    });
    assert.equal(parsed.score, 2);
    assert.match(parsed.summary, /Too many turns/);
    assert.equal(parsed.findings.length, 5);
    assert.equal(parsed.findings[0]?.severity, 'issue');
    assert.equal(parsed.findings.find((item) => item.category === 'wasted_tokens')?.severity, 'ok');
    assert.equal(parsed.findings.find((item) => item.category === 'skills')?.title, 'No retry skill');
    assert.equal(parsed.stats.userTurns, 8);
  });

  it('parses compact unquoted keys instead of throwing a JSON SyntaxError', () => {
    const parsed = parseSessionGradeResponse(
      '{score: 2, summary: "Too many turns and no test skill.", findings: [{category: "excessive_turns", severity: "issue", title: "Eight retries", detail: "The user restated the same ask."}]}',
      {
        userTurns: 8,
        assistantTurns: 8,
        estimatedTokens: 12000,
        costUsd: 1.2,
        toolCalls: 20,
        instructionFileCount: 1,
        skillCount: 2,
      },
    );
    assert.equal(parsed.score, 2);
    assert.match(parsed.summary, /Too many turns/);
    assert.equal(parsed.findings[0]?.severity, 'issue');
  });

  it('ignores prose braces before the grade object', () => {
    const parsed = parseSessionGradeResponse(
      'Wasted tokens {especially rereads}.\n{"score":4,"summary":"Mostly efficient.","findings":[]}',
      {
        userTurns: 1,
        assistantTurns: 1,
        estimatedTokens: 10,
        costUsd: null,
        toolCalls: 0,
        instructionFileCount: 0,
        skillCount: 0,
      },
    );
    assert.equal(parsed.score, 4);
    assert.match(parsed.summary, /Mostly efficient/);
  });

  it('accepts an already-parsed tool payload', () => {
    const parsed = parseSessionGradeResponse(
      { score: 5, summary: 'Efficient session.', findings: [] },
      {
        userTurns: 1,
        assistantTurns: 1,
        estimatedTokens: 10,
        costUsd: null,
        toolCalls: 0,
        instructionFileCount: 0,
        skillCount: 0,
      },
    );
    assert.equal(parsed.score, 5);
  });

  it('derives a score from findings when the model omits one', () => {
    const parsed = parseSessionGradeResponse(
      JSON.stringify({
        summary: 'Mixed.',
        findings: [
          { category: 'excessive_turns', severity: 'issue', title: 'Long', detail: 'Many turns' },
          { category: 'wasted_tokens', severity: 'warning', title: 'Rereads', detail: 'Read loop' },
        ],
      }),
      {
        userTurns: 1,
        assistantTurns: 1,
        estimatedTokens: 10,
        costUsd: null,
        toolCalls: 0,
        instructionFileCount: 0,
        skillCount: 0,
      },
    );
    assert.equal(parsed.score, 2);
  });

  it('rejects a response without a summary', () => {
    assert.throws(
      () =>
        parseSessionGradeResponse(
          '{"score":3,"findings":[]}',
          {
            userTurns: 1,
            assistantTurns: 1,
            estimatedTokens: 10,
            costUsd: null,
            toolCalls: 0,
            instructionFileCount: 0,
            skillCount: 0,
          },
        ),
      /missing a summary/,
    );
  });
});
