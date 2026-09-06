import type {
  WorkspaceAiCheck,
  WorkspaceAiCheckId,
  WorkspaceAiFileInfo,
  WorkspaceAiReadiness,
} from '@agent-orchestrator/shared';
import type { GitService } from './git.js';

const CLAUDE_CANDIDATES = ['CLAUDE.md', '.claude/CLAUDE.md'] as const;
const AGENTS_PATH = 'AGENTS.md';
const MAX_CONCISE_LINES = 200;
const WARN_CONCISE_LINES = 150;
const BLOATED_LINES = 300;

export interface InstructionSnapshot {
  claudePath: string | null;
  claudeContent: string | null;
  agentsContent: string | null;
  skillPaths: string[];
  files: WorkspaceAiFileInfo[];
}

function countLines(content: string | null): number | null {
  if (content == null) return null;
  if (content.length === 0) return 0;
  return content.replace(/\n$/, '').split('\n').length;
}

function toFileInfo(path: string, content: string | null): WorkspaceAiFileInfo {
  return {
    path,
    exists: content != null,
    lineCount: countLines(content),
    charCount: content?.length ?? null,
  };
}

function hasCommandHints(text: string): boolean {
  return (
    /\b(npm|pnpm|yarn|bun|make|cargo|go|pytest|vitest|jest)\b/i.test(text) &&
    /\b(test|lint|typecheck|build|install|dev)\b/i.test(text)
  );
}

function hasVerificationHints(text: string): boolean {
  return /\b(verif|test|typecheck|lint|ci|check)\b/i.test(text);
}

function hasBoundaryHints(text: string): boolean {
  return /\b(do not|don't|never|must not|avoid|boundaries|off-limits)\b/i.test(text);
}

function looksLikeSecondReadme(text: string): boolean {
  const lines = countLines(text) ?? 0;
  if (lines < BLOATED_LINES) return false;
  const hits = (text.match(/\b(architecture|overview|introduction|table of contents)\b/gi) ?? []).length;
  return hits >= 3;
}

export async function loadInstructionSnapshot(
  git: GitService,
  repoPath: string,
  ref: string,
): Promise<InstructionSnapshot> {
  let claudePath: string | null = null;
  let claudeContent: string | null = null;
  for (const candidate of CLAUDE_CANDIDATES) {
    const content = await git.showFileAtRef(repoPath, ref, candidate);
    if (content != null) {
      claudePath = candidate;
      claudeContent = content;
      break;
    }
  }

  const agentsContent = await git.showFileAtRef(repoPath, ref, AGENTS_PATH);
  const skillTree = await git.listPathsAtRef(repoPath, ref, '.claude/skills');
  const skillPaths = skillTree
    .filter((p) => /(^|\/)SKILL\.md$/.test(p))
    .map((p) => (p.startsWith('.claude/skills') ? p : `.claude/skills/${p}`))
    .sort();

  return {
    claudePath,
    claudeContent,
    agentsContent,
    skillPaths,
    files: [
      ...CLAUDE_CANDIDATES.map((path) =>
        toFileInfo(path, path === claudePath ? claudeContent : null),
      ),
      toFileInfo(AGENTS_PATH, agentsContent),
    ],
  };
}

export function buildDeterministicChecks(snapshot: InstructionSnapshot): WorkspaceAiCheck[] {
  const checks: WorkspaceAiCheck[] = [];
  const claude = snapshot.claudeContent;
  const agents = snapshot.agentsContent;
  const combined = [claude, agents].filter(Boolean).join('\n\n');

  checks.push({
    id: 'claude_md_present',
    title: 'CLAUDE.md present',
    status: claude != null ? 'pass' : 'fail',
    detail:
      claude != null
        ? `Found ${snapshot.claudePath}`
        : 'Neither CLAUDE.md nor .claude/CLAUDE.md exists on the default branch',
    recommendation:
      'Add a concise CLAUDE.md with repo-specific commands, verification steps, and boundaries. Use /init as a draft, then prune.',
  });

  checks.push({
    id: 'agents_md_present',
    title: 'AGENTS.md present',
    status: agents != null ? 'pass' : 'warn',
    detail: agents != null ? 'Found AGENTS.md' : 'No AGENTS.md (useful for shared / cross-agent ops)',
    recommendation:
      'Add AGENTS.md with install/test/typecheck commands and expensive-operation warnings, then import it from CLAUDE.md with @AGENTS.md.',
  });

  const importsAgents = claude != null && /@AGENTS\.md\b/.test(claude);
  checks.push({
    id: 'claude_imports_agents',
    title: 'CLAUDE.md imports AGENTS.md',
    status: claude == null || agents == null ? 'info' : importsAgents ? 'pass' : 'warn',
    detail:
      claude == null || agents == null
        ? 'Skipped until both files exist'
        : importsAgents
          ? 'CLAUDE.md references @AGENTS.md'
          : 'Both files exist but CLAUDE.md does not @-import AGENTS.md',
    recommendation:
      'Put shared ops in AGENTS.md and start CLAUDE.md with `@AGENTS.md`, then add only Claude-specific notes.',
  });

  const claudeLines = countLines(claude);
  checks.push({
    id: 'claude_md_concise',
    title: 'CLAUDE.md stays concise',
    status:
      claudeLines == null
        ? 'fail'
        : claudeLines > BLOATED_LINES
          ? 'fail'
          : claudeLines > WARN_CONCISE_LINES
            ? 'warn'
            : 'pass',
    detail:
      claudeLines == null
        ? 'Missing CLAUDE.md'
        : `${claudeLines} lines (target ≤ ${MAX_CONCISE_LINES})`,
    recommendation:
      'Keep CLAUDE.md under ~200 lines. Move workflows into .claude/skills and shared ops into AGENTS.md.',
  });

  const agentsLines = countLines(agents);
  checks.push({
    id: 'agents_md_concise',
    title: 'AGENTS.md stays concise',
    status:
      agentsLines == null
        ? 'info'
        : agentsLines > BLOATED_LINES
          ? 'fail'
          : agentsLines > WARN_CONCISE_LINES
            ? 'warn'
            : 'pass',
    detail:
      agentsLines == null ? 'No AGENTS.md' : `${agentsLines} lines (target ≤ ${MAX_CONCISE_LINES})`,
    recommendation: 'Trim AGENTS.md to exact commands, costs, verification, and boundaries.',
  });

  checks.push({
    id: 'has_commands',
    title: 'Documents runnable commands',
    status: !combined ? 'fail' : hasCommandHints(combined) ? 'pass' : 'fail',
    detail: !combined
      ? 'No instruction files to scan'
      : hasCommandHints(combined)
        ? 'Found package-manager / test / build style commands'
        : 'No clear install/test/lint/typecheck/build commands',
    recommendation:
      'Document the exact install, focused test, typecheck, lint, and build commands agents should run.',
  });

  checks.push({
    id: 'has_verification',
    title: 'Defines verification loop',
    status: !combined ? 'fail' : hasVerificationHints(combined) ? 'pass' : 'warn',
    detail: !combined
      ? 'No instruction files to scan'
      : hasVerificationHints(combined)
        ? 'Mentions tests / checks / verification'
        : 'No explicit verification guidance',
    recommendation:
      'Tell agents how to verify work (focused tests, typecheck, lint) and when the full suite is required.',
  });

  checks.push({
    id: 'has_boundaries',
    title: 'States boundaries',
    status: !combined ? 'warn' : hasBoundaryHints(combined) ? 'pass' : 'warn',
    detail: !combined
      ? 'No instruction files to scan'
      : hasBoundaryHints(combined)
        ? 'Found boundary / do-not language'
        : 'No explicit do-not / ask-first boundaries',
    recommendation:
      'Call out non-obvious boundaries (generated code, migrations, secrets) with a safe alternative path.',
  });

  checks.push({
    id: 'has_skills',
    title: 'Claude skills for workflows',
    status: snapshot.skillPaths.length > 0 ? 'pass' : 'warn',
    detail:
      snapshot.skillPaths.length > 0
        ? `${snapshot.skillPaths.length} skill(s): ${snapshot.skillPaths.slice(0, 5).join(', ')}`
        : 'No .claude/skills/*/SKILL.md files',
    recommendation:
      'Add .claude/skills for multi-step workflows so they load on demand instead of bloating CLAUDE.md.',
  });

  const bloated =
    (claude != null && looksLikeSecondReadme(claude)) ||
    (agents != null && looksLikeSecondReadme(agents));
  checks.push({
    id: 'not_second_readme',
    title: 'Not a second README',
    status: bloated ? 'warn' : 'pass',
    detail: bloated
      ? 'Instruction files look like long architecture essays'
      : 'No strong second-README signal',
    recommendation:
      'Keep only facts that change agent actions. Drop architecture tours and dependency inventories agents can discover.',
  });

  return checks;
}

export function scoreChecks(checks: WorkspaceAiCheck[]): { score: number; maxScore: number } {
  const maxScore = checks.filter((c) => c.status !== 'info').length * 10;
  let score = 0;
  for (const check of checks) {
    if (check.status === 'info') continue;
    if (check.status === 'pass') score += 10;
    else if (check.status === 'warn') score += 5;
  }
  return { score, maxScore };
}

export function buildImplementGoal(
  readiness: WorkspaceAiReadiness,
  checkIds?: WorkspaceAiCheckId[],
): string {
  const selected = new Set(
    checkIds?.length
      ? checkIds
      : readiness.checks.filter((c) => c.status === 'fail' || c.status === 'warn').map((c) => c.id),
  );
  const focus = readiness.checks.filter((c) => selected.has(c.id));
  const lines = [
    'Improve this repository’s AI coding-agent readiness on the default branch.',
    '',
    `Analyzed ref: ${readiness.analyzedRef} (${readiness.analyzedSha ?? 'unknown sha'})`,
    `Current score: ${readiness.score}/${readiness.maxScore}`,
    '',
    'Follow Claude Code best practices:',
    '- Keep CLAUDE.md concise (under ~200 lines); put shared ops in AGENTS.md and import with @AGENTS.md',
    '- Document exact install/test/typecheck/lint commands and expensive-operation warnings',
    '- Put multi-step workflows in .claude/skills/*/SKILL.md (progressive disclosure)',
    '- Prefer verification loops and clear boundaries over generic advice',
    '',
    'Focus on these findings:',
  ];
  for (const check of focus) {
    lines.push(`- [${check.status}] ${check.title}: ${check.detail}`);
    lines.push(`  Do: ${check.recommendation}`);
  }
  if (readiness.llm?.implementationPlan) {
    lines.push('', 'LLM implementation plan:', readiness.llm.implementationPlan);
  }
  if (readiness.llm?.priorities?.length) {
    lines.push('', 'Priorities:');
    for (const p of readiness.llm.priorities) lines.push(`- ${p}`);
  }
  lines.push(
    '',
    'Implement the instruction-file and skill improvements on a new branch, verify with the repo’s checks, and summarize what changed.',
  );
  return lines.join('\n');
}
