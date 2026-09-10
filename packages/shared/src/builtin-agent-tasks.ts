import type { CreateAgentTaskRequest } from './agent-task.js';
import { skillInvocationLead } from './phase-skills.js';

export type BuiltInAgentTaskSeed = CreateAgentTaskRequest & { builtIn: true };

const PLAN_UNTIL_APPROVED =
  'Stay in plan mode until the plan is approved. Prefer Agent(Explore) for codebase discovery.';

/** Thin built-in AgentTask seeds. Kickoff prompt/model/mode live here, not in session templates. */
export const BUILTIN_AGENT_TASK_SEEDS: readonly BuiltInAgentTaskSeed[] = [
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
      PLAN_UNTIL_APPROVED,
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
    purpose:
      'Refactors, cleanup, renames, and structural improvements without changing product behavior.',
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
  {
    name: 'chat',
    title: 'New chat',
    description: 'Start a fresh plan-mode conversation.',
    purpose: '',
    promptTemplate: null,
    systemPrompt: null,
    permissionMode: 'plan',
    listed: true,
    builtIn: true,
  },
  {
    name: 'create-draft-pr',
    title: 'Create draft PR',
    description: 'Summarize changes and open a draft pull request.',
    purpose: '',
    promptTemplate: [
      'Create a draft pull request for the current branch.',
      'Summarize the changes, write a good title and description, commit remaining work if needed, push, and open a draft PR.',
      'Do not merge. If a PR already exists for this branch, update it instead of opening a duplicate.',
    ].join(' '),
    systemPrompt: null,
    permissionMode: 'auto',
    listed: true,
    builtIn: true,
  },
  {
    name: 'review',
    title: 'Review',
    description: 'Review the current diff for bugs, edge cases, and missing tests.',
    purpose: '',
    promptTemplate: [
      'Use the code-review skill (`/code-review` or the Skill tool) to review the current uncommitted and branch changes for bugs, edge cases, missing tests, and regressions.',
      'Start by inspecting the diff. Ask clarifying questions if the intent is unclear.',
      'Do not make changes unless I ask you to.',
    ].join(' '),
    systemPrompt: null,
    permissionMode: 'plan',
    listed: true,
    builtIn: true,
  },
  {
    name: 'address-review',
    title: 'Address review',
    description: 'Address PR review feedback seeded from GitHub comments.',
    purpose: '',
    promptTemplate: [
      'Use the address-review skill (`/address-review` or the Skill tool) to address the pull request review feedback on the current branch.',
      'Fix the requested changes, add tests when they were asked for, and reply in the PR when a comment needs a written response rather than a code change.',
      'Do not merge. Leave a short summary of what you changed.',
    ].join(' '),
    systemPrompt: null,
    permissionMode: 'auto',
    listed: true,
    builtIn: true,
  },
  {
    name: 'fix-ci',
    title: 'Fix CI',
    description: 'Fix failing CI checks with GitHub check-run context.',
    purpose: '',
    promptTemplate: [
      'Use the fix-ci skill (`/fix-ci` or the Skill tool) to fix the failing CI checks on the current branch.',
      'Reproduce the failures locally when possible, fix the root cause, and leave tests covering the failure.',
      'Do not merge. Summarize which checks failed and what you changed.',
    ].join(' '),
    systemPrompt: null,
    permissionMode: 'auto',
    listed: true,
    builtIn: true,
  },
  {
    name: 'resolve-conflicts',
    title: 'Resolve conflicts',
    description: 'Merge the base branch and resolve conflicts on this PR.',
    purpose: '',
    promptTemplate: [
      'This pull request has merge conflicts with the base branch.',
      'Merge or rebase onto the base branch, resolve every conflict carefully, keep existing tests green, and push the result.',
      'Prefer preserving intent from both sides; do not drop unrelated changes.',
      'Do not merge the pull request. Summarize which files conflicted and how you resolved them.',
    ].join(' '),
    systemPrompt: null,
    permissionMode: 'auto',
    listed: true,
    builtIn: true,
  },
  {
    name: 'build',
    title: 'Build',
    description: 'Implement an approved plan in auto mode.',
    purpose: '',
    promptTemplate: [
      skillInvocationLead('implement-plan'),
      'The user approved the following plan. Implement it now in auto mode.',
      'Do not ask clarifying questions unless blocked. Prefer making progress with sensible defaults.',
      '',
      '## Approved plan',
      '',
      '{{plan}}',
    ].join('\n'),
    systemPrompt: null,
    permissionMode: 'auto',
    listed: false,
    builtIn: true,
  },
  {
    name: 'github-issue',
    title: 'GitHub issue',
    description: 'Plan work from a GitHub issue.',
    purpose: '',
    promptTemplate: [`{{goal}}`, '', skillInvocationLead('plan-work'), PLAN_UNTIL_APPROVED].join(
      '\n',
    ),
    systemPrompt:
      'Default to the plan-work skill for scoping. Use subagents for exploration; keep synthesis on the parent.',
    permissionMode: 'plan',
    listed: false,
    builtIn: true,
  },
  {
    name: 'jira-issue',
    title: 'Jira issue',
    description: 'Plan work from a Jira issue.',
    purpose: '',
    promptTemplate: [`{{goal}}`, '', skillInvocationLead('plan-work'), PLAN_UNTIL_APPROVED].join(
      '\n',
    ),
    systemPrompt:
      'Default to the plan-work skill for scoping. Use subagents for exploration; keep synthesis on the parent.',
    permissionMode: 'plan',
    listed: false,
    builtIn: true,
  },
  {
    name: 'compact-continue',
    title: 'Compact continue',
    description: 'Continue after compacting a full session.',
    purpose: '',
    promptTemplate: [
      'This session continues earlier work whose context window was nearly full.',
      'The summary below covers the prior conversation. Re-read the files in play before changing them; do not assume unlisted work was done.',
      '',
      '## Session summary',
      '',
      '{{summary}}',
    ].join('\n'),
    systemPrompt: null,
    permissionMode: 'plan',
    listed: false,
    builtIn: true,
  },
];

const SEEDS_BY_NAME = new Map(BUILTIN_AGENT_TASK_SEEDS.map((seed) => [seed.name, seed]));

export function builtinAgentTaskSeedByName(name: string | undefined): BuiltInAgentTaskSeed | undefined {
  if (!name) return undefined;
  return SEEDS_BY_NAME.get(name);
}
