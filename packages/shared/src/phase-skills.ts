import type { ChatSessionTemplateId } from './chat-session.js';
import type { CreateAgentTaskRequest } from './agent-task.js';
import type { SlashCommand } from './constants.js';

/** Subset of session grade stats used for skill efficiency tracking. */
export interface SkillEfficiencyStats {
  userTurns: number;
  assistantTurns: number;
  estimatedTokens: number;
  costUsd: number | null;
  toolCalls: number;
}

/** Built-in orchestrator phase skills (offered as bundled slash commands; not auto-copied into worktrees). */
export const PHASE_SKILL_SLUGS = [
  'plan-work',
  'implement-plan',
  'code-review',
  'fix-ci',
  'address-review',
] as const;

export type PhaseSkillSlug = (typeof PHASE_SKILL_SLUGS)[number];

export interface PhaseSkillDefinition {
  slug: PhaseSkillSlug;
  title: string;
  description: string;
  /** Session templates that should prefer this skill. */
  templates: readonly ChatSessionTemplateId[];
}

export const PHASE_SKILLS: readonly PhaseSkillDefinition[] = [
  {
    slug: 'plan-work',
    title: 'Plan work',
    description: 'Scope, explore with subagents, and produce an ExitPlanMode-ready plan.',
    templates: ['chat'],
  },
  {
    slug: 'implement-plan',
    title: 'Implement plan',
    description: 'Execute an approved plan efficiently with parallel Explore/Task when useful.',
    templates: ['build'],
  },
  {
    slug: 'code-review',
    title: 'Code review',
    description: 'Review the branch diff for bugs, edge cases, and missing tests.',
    templates: ['review'],
  },
  {
    slug: 'fix-ci',
    title: 'Fix CI',
    description: 'Reproduce failing checks, fix the root cause, and leave coverage.',
    templates: ['fix-ci'],
  },
  {
    slug: 'address-review',
    title: 'Address review',
    description: 'Map PR review feedback to patches and reply when needed.',
    templates: ['address-review'],
  },
];

const TEMPLATE_TO_SKILL = new Map<ChatSessionTemplateId, PhaseSkillSlug>();
for (const skill of PHASE_SKILLS) {
  for (const template of skill.templates) {
    TEMPLATE_TO_SKILL.set(template, skill.slug);
  }
}

export function phaseSkillForTemplate(
  template: ChatSessionTemplateId | string | undefined,
): PhaseSkillSlug | null {
  if (!template) return null;
  return TEMPLATE_TO_SKILL.get(template as ChatSessionTemplateId) ?? null;
}

export function phaseSkillRelativePath(slug: PhaseSkillSlug | string): string {
  return `.claude/skills/${slug}/SKILL.md`;
}

export function isPhaseSkillSlug(value: string | null | undefined): value is PhaseSkillSlug {
  return Boolean(value && (PHASE_SKILL_SLUGS as readonly string[]).includes(value));
}

/** Slash autocomplete entries for phase skills (merged under bundled). */
export const PHASE_SKILL_COMMANDS: SlashCommand[] = PHASE_SKILLS.map((skill) => ({
  command: `/${skill.slug}`,
  description: skill.description,
  kind: 'skill' as const,
  source: 'bundled' as const,
  ...(skill.slug === 'code-review' ? { aliases: ['/review'] } : {}),
}));

/** Kickoff line that steers Claude to invoke a phase skill. */
export function skillInvocationLead(slug: PhaseSkillSlug | string): string {
  return `Use the ${slug} skill (\`/${slug}\` or the Skill tool) for this work.`;
}

export interface SkillEfficiencySnapshot {
  skillSlug: string;
  version: number;
  stats: SkillEfficiencyStats;
  gradedAt: string;
  sessionId: string;
}

export interface SkillMetricsComparison {
  previous: SkillEfficiencySnapshot | null;
  current: SkillEfficiencySnapshot;
  deltas: {
    assistantTurns: number | null;
    estimatedTokens: number | null;
    costUsd: number | null;
  };
}

export function compareSkillSnapshots(
  previous: SkillEfficiencySnapshot | null,
  current: SkillEfficiencySnapshot,
): SkillMetricsComparison {
  return {
    previous,
    current,
    deltas: {
      assistantTurns:
        previous == null ? null : current.stats.assistantTurns - previous.stats.assistantTurns,
      estimatedTokens:
        previous == null ? null : current.stats.estimatedTokens - previous.stats.estimatedTokens,
      costUsd:
        previous?.stats.costUsd == null || current.stats.costUsd == null
          ? null
          : Number((current.stats.costUsd - previous.stats.costUsd).toFixed(4)),
    },
  };
}

/** Parse optional `version:` from SKILL.md YAML frontmatter. */
export function parseSkillVersion(content: string): number {
  if (!content.startsWith('---')) return 1;
  const end = content.indexOf('\n---', 3);
  if (end === -1) return 1;
  const block = content.slice(3, end);
  const match = block.match(/^version\s*:\s*(\d+)\s*$/m);
  if (!match) return 1;
  const version = Number(match[1]);
  return Number.isFinite(version) && version > 0 ? version : 1;
}

/** Bump or insert `version` in SKILL.md frontmatter. */
export function bumpSkillFrontmatterVersion(content: string): string {
  if (!content.startsWith('---')) {
    return `---\nversion: 2\n---\n\n${content}`;
  }
  const end = content.indexOf('\n---', 3);
  if (end === -1) return content;
  const block = content.slice(3, end);
  const body = content.slice(end + 4);
  if (/^version\s*:/m.test(block)) {
    const next = block.replace(/^version\s*:\s*\d+\s*$/m, (line) => {
      const current = Number(line.match(/(\d+)/)?.[1] ?? '1');
      return `version: ${Number.isFinite(current) ? current + 1 : 2}`;
    });
    return `---${next}\n---${body}`;
  }
  return `---${block}\nversion: 2\n---${body}`;
}

/** Set an absolute `version` in SKILL.md frontmatter. */
export function setSkillFrontmatterVersion(content: string, version: number): string {
  const nextVersion = Math.max(1, Math.floor(version));
  if (!content.startsWith('---')) {
    return `---\nversion: ${nextVersion}\n---\n\n${content}`;
  }
  const end = content.indexOf('\n---', 3);
  if (end === -1) return content;
  const block = content.slice(3, end);
  const body = content.slice(end + 4);
  if (/^version\s*:/m.test(block)) {
    const next = block.replace(/^version\s*:\s*\d+\s*$/m, `version: ${nextVersion}`);
    return `---${next}\n---${body}`;
  }
  return `---${block}\nversion: ${nextVersion}\n---${body}`;
}

/** Thin built-in AgentTask seeds that point at the phase skill pack. */
export const BUILTIN_AGENT_TASK_SEEDS: ReadonlyArray<
  CreateAgentTaskRequest & { builtIn: true }
> = [
  {
    name: 'feature',
    title: 'Feature',
    description: 'Plan and ship a new feature from a goal.',
    purpose:
      'New product or engineering features, user-facing changes, and greenfield work in an existing repo.',
    promptTemplate: [
      '{{goal}}',
      '',
      skillInvocationLead('plan-work'),
      'Stay in plan mode until the plan is approved. Prefer Agent(Explore) for codebase discovery.',
    ].join('\n'),
    systemPrompt:
      'Default to the plan-work skill for scoping. Use subagents for exploration; keep synthesis on the parent.',
    permissionMode: 'plan',
    listed: true,
    builtIn: true,
  },
  {
    name: 'bugfix',
    title: 'Bugfix',
    description: 'Diagnose and fix a bug from a goal.',
    purpose: 'Bug reports, regressions, incorrect behavior, and crash fixes.',
    promptTemplate: [
      '{{goal}}',
      '',
      skillInvocationLead('plan-work'),
      'Reproduce first, then propose a minimal fix plan. Prefer Agent(Explore) to find related call sites.',
    ].join('\n'),
    systemPrompt:
      'Bias toward root-cause analysis. Use plan-work, then implement-plan after approval.',
    permissionMode: 'plan',
    listed: true,
    builtIn: true,
  },
  {
    name: 'refactor',
    title: 'Refactor',
    description: 'Plan a focused refactor with clear boundaries.',
    purpose: 'Refactors, cleanup, renames, and structural improvements without changing product behavior.',
    promptTemplate: [
      '{{goal}}',
      '',
      skillInvocationLead('plan-work'),
      'Keep behavior stable. Identify blast radius with Explore before proposing steps.',
    ].join('\n'),
    systemPrompt: 'Prefer small, reviewable steps. Use plan-work then implement-plan.',
    permissionMode: 'plan',
    listed: true,
    builtIn: true,
  },
];
