import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildDeterministicChecks,
  buildImplementGoal,
  scoreChecks,
  type InstructionSnapshot,
} from './workspace-ai-readiness-checks.js';
import { parseAiReadinessLlmResponse } from './workspace-ai-readiness-llm.js';
import type { WorkspaceAiReadiness } from '@agent-orchestrator/shared';

function snapshot(overrides: Partial<InstructionSnapshot> = {}): InstructionSnapshot {
  return {
    claudePath: null,
    claudeContent: null,
    agentsContent: null,
    skillPaths: [],
    files: [],
    ...overrides,
  };
}

test('buildDeterministicChecks fails when CLAUDE.md is missing', () => {
  const checks = buildDeterministicChecks(snapshot());
  const claude = checks.find((c) => c.id === 'claude_md_present');
  assert.equal(claude?.status, 'fail');
  const commands = checks.find((c) => c.id === 'has_commands');
  assert.equal(commands?.status, 'fail');
});

test('buildDeterministicChecks passes a well-configured instruction set', () => {
  const claudeContent = [
    '@AGENTS.md',
    '',
    '# Claude notes',
    '',
    'Do not edit generated/ — run pnpm generate instead.',
    'Verify with pnpm typecheck after TypeScript changes.',
  ].join('\n');
  const agentsContent = [
    '# AGENTS.md',
    '',
    '## Commands',
    '- Install: `pnpm install`',
    '- Test: `pnpm test`',
    '- Typecheck: `pnpm typecheck`',
    '- Lint: `pnpm lint`',
    '',
    '## Boundaries',
    '- Never commit secrets.',
  ].join('\n');

  const checks = buildDeterministicChecks(
    snapshot({
      claudePath: 'CLAUDE.md',
      claudeContent,
      agentsContent,
      skillPaths: ['.claude/skills/cloud-agent-ui-test/SKILL.md'],
    }),
  );

  assert.equal(checks.find((c) => c.id === 'claude_md_present')?.status, 'pass');
  assert.equal(checks.find((c) => c.id === 'agents_md_present')?.status, 'pass');
  assert.equal(checks.find((c) => c.id === 'claude_imports_agents')?.status, 'pass');
  assert.equal(checks.find((c) => c.id === 'has_commands')?.status, 'pass');
  assert.equal(checks.find((c) => c.id === 'has_verification')?.status, 'pass');
  assert.equal(checks.find((c) => c.id === 'has_boundaries')?.status, 'pass');
  assert.equal(checks.find((c) => c.id === 'has_skills')?.status, 'pass');

  const { score, maxScore } = scoreChecks(checks);
  assert.ok(score >= 70);
  assert.ok(maxScore >= score);
});

test('buildDeterministicChecks warns on bloated CLAUDE.md without @AGENTS.md import', () => {
  const claudeContent = `${'Architecture overview\n'.repeat(320)}Introduction\nTable of contents\n`;
  const agentsContent = '# AGENTS.md\n\nRun `pnpm test`.\n';
  const checks = buildDeterministicChecks(
    snapshot({
      claudePath: 'CLAUDE.md',
      claudeContent,
      agentsContent,
    }),
  );
  assert.equal(checks.find((c) => c.id === 'claude_md_concise')?.status, 'fail');
  assert.equal(checks.find((c) => c.id === 'claude_imports_agents')?.status, 'warn');
  assert.equal(checks.find((c) => c.id === 'not_second_readme')?.status, 'warn');
});

test('parseAiReadinessLlmResponse extracts JSON object', () => {
  const advice = parseAiReadinessLlmResponse(
    'Here you go:\n{"summary":"Needs AGENTS.md","priorities":["Add AGENTS.md","Import it"],"implementationPlan":"1. Add AGENTS.md\\n2. Import"}\n',
  );
  assert.equal(advice.summary, 'Needs AGENTS.md');
  assert.deepEqual(advice.priorities, ['Add AGENTS.md', 'Import it']);
  assert.match(advice.implementationPlan, /Add AGENTS\.md/);
});

test('buildImplementGoal includes failing checks and llm plan', () => {
  const readiness: WorkspaceAiReadiness = {
    defaultBranch: 'main',
    analyzedRef: 'origin/main',
    analyzedSha: 'abc123',
    score: 40,
    maxScore: 100,
    checks: [
      {
        id: 'claude_md_present',
        title: 'CLAUDE.md present',
        status: 'fail',
        detail: 'Missing',
        recommendation: 'Add CLAUDE.md',
      },
      {
        id: 'has_skills',
        title: 'Claude skills for workflows',
        status: 'pass',
        detail: 'ok',
        recommendation: 'n/a',
      },
    ],
    files: [],
    skillPaths: [],
    llm: {
      summary: 'Start with CLAUDE.md',
      priorities: ['Add CLAUDE.md'],
      implementationPlan: 'Create CLAUDE.md with commands',
    },
    llmError: null,
    checkedAt: new Date().toISOString(),
  };

  const goal = buildImplementGoal(readiness);
  assert.match(goal, /CLAUDE\.md present/);
  assert.match(goal, /Create CLAUDE\.md with commands/);
  assert.doesNotMatch(goal, /Claude skills for workflows/);
});
