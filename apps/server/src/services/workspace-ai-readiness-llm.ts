import type { WorkspaceAiCheck, WorkspaceAiLlmAdvice } from '@agent-orchestrator/shared';
import type { InstructionSnapshot } from './workspace-ai-readiness-checks.js';

const MAX_EXCERPT = 2500;

function excerpt(content: string | null): string {
  if (!content) return '(missing)';
  const trimmed = content.trim();
  if (trimmed.length <= MAX_EXCERPT) return trimmed;
  return `${trimmed.slice(0, MAX_EXCERPT)}\n…(truncated)`;
}

export function buildAiReadinessLlmPrompt(input: {
  defaultBranch: string;
  analyzedRef: string;
  checks: WorkspaceAiCheck[];
  snapshot: InstructionSnapshot;
}): { system: string; user: string } {
  const system = [
    'You advise teams on making a git default branch efficient for Claude Code and similar coding agents.',
    'Prefer short operating manuals over long READMEs: exact commands, expensive-op warnings, verification, boundaries.',
    'CLAUDE.md should stay under ~200 lines; shared ops belong in AGENTS.md (imported via @AGENTS.md); workflows belong in .claude/skills.',
    'Respond with a single JSON object only, no markdown fences:',
    '{"summary":"2-4 sentences","priorities":["..."],"implementationPlan":"multi-step plan for an implement agent"}',
  ].join(' ');

  const checkLines = input.checks
    .map((c) => `- ${c.id} [${c.status}] ${c.title}: ${c.detail}`)
    .join('\n');

  const user = [
    `Default branch: ${input.defaultBranch}`,
    `Analyzed ref: ${input.analyzedRef}`,
    '',
    'Deterministic checks:',
    checkLines,
    '',
    `Skills: ${input.snapshot.skillPaths.join(', ') || '(none)'}`,
    '',
    `CLAUDE.md (${input.snapshot.claudePath ?? 'missing'}):`,
    excerpt(input.snapshot.claudeContent),
    '',
    'AGENTS.md:',
    excerpt(input.snapshot.agentsContent),
    '',
    'Return JSON with summary, priorities (3-6 items), and implementationPlan.',
  ].join('\n');

  return { system, user };
}

export function parseAiReadinessLlmResponse(raw: string): WorkspaceAiLlmAdvice {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) {
    throw new Error('LLM response did not contain JSON');
  }
  const parsed = JSON.parse(raw.slice(start, end + 1)) as {
    summary?: unknown;
    priorities?: unknown;
    implementationPlan?: unknown;
  };
  const summary = typeof parsed.summary === 'string' ? parsed.summary.trim() : '';
  const implementationPlan =
    typeof parsed.implementationPlan === 'string' ? parsed.implementationPlan.trim() : '';
  const priorities = Array.isArray(parsed.priorities)
    ? parsed.priorities
        .filter((p): p is string => typeof p === 'string')
        .map((p) => p.trim())
        .filter(Boolean)
    : [];
  if (!summary || !implementationPlan) {
    throw new Error('LLM JSON missing summary or implementationPlan');
  }
  return { summary, priorities, implementationPlan };
}
