import type { SessionGradeFinding } from './chat-session.js';
import { INSTRUCTION_GRADE_FINDING_CATEGORIES } from './chat-session.js';
import { isPhaseSkillSlug } from './phase-skills.js';

/** Distinct graded sessions that must share a gap before clustering. */
export const SKILL_GAP_CLUSTER_THRESHOLD = 3;
/** Recent graded sessions scanned when grouping gaps. */
export const SKILL_GAP_CLUSTER_LOOKBACK = 40;

export interface SkillGapCluster {
  key: string;
  theme: string;
  skillSlug: string;
  count: number;
  sessionIds: string[];
  titles: string[];
  details: string[];
}

export interface SkillGapSessionInput {
  id: string;
  findings: SessionGradeFinding[];
}

interface ThemePattern {
  id: string;
  slug: string;
  theme: string;
  pattern: RegExp;
}

/** Recurring gaps that should become one personal skill instead of N drafts. */
export const SKILL_GAP_THEMES: readonly ThemePattern[] = [
  {
    id: 'skipped-tests',
    slug: 'always-run-tests',
    theme: 'never ran tests',
    pattern:
      /never ran tests|did not run tests|didn't run tests|skipped tests|no tests? after|forgot (?:to )?test/i,
  },
  {
    id: 'skipped-explore',
    slug: 'use-explore-first',
    theme: 're-explored instead of using Explore',
    pattern:
      /re-explor|instead of using explore|did not use explore|didn't use explore|didn't use the explore|no explore tool/i,
  },
  {
    id: 'skipped-subagent',
    slug: 'spawn-subagents',
    theme: 'did not spawn a subagent',
    pattern:
      /did not (?:use|spawn) (?:a )?subagent|didn't spawn|missing (?:the )?task tool/i,
  },
];

export function isInstructionGapFinding(finding: SessionGradeFinding): boolean {
  return (
    finding.severity !== 'ok' &&
    INSTRUCTION_GRADE_FINDING_CATEGORIES.includes(finding.category)
  );
}

function findingText(finding: SessionGradeFinding): string {
  return [finding.title, finding.detail, finding.suggestion].filter(Boolean).join('\n');
}

export function slugifySkillGap(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

/** Stable key for grouping similar instruction/skill findings. */
export function skillGapClusterKey(finding: SessionGradeFinding): {
  key: string;
  theme: string;
  skillSlug: string;
} {
  const text = findingText(finding);
  for (const theme of SKILL_GAP_THEMES) {
    if (theme.pattern.test(text)) {
      return { key: `theme:${theme.id}`, theme: theme.theme, skillSlug: theme.slug };
    }
  }
  const actionName =
    finding.recommendedAction?.kind === 'skill' ? finding.recommendedAction.name?.trim() : '';
  if (actionName && !isPhaseSkillSlug(actionName)) {
    const slug = slugifySkillGap(actionName);
    return { key: `skill:${slug}`, theme: finding.title.trim() || slug, skillSlug: slug };
  }
  const titleSlug = slugifySkillGap(finding.title) || 'session-lesson';
  return {
    key: `${finding.category}:${titleSlug}`,
    theme: finding.title.trim() || titleSlug,
    skillSlug: slugifySkillGap(finding.recommendedAction?.name ?? '') || titleSlug,
  };
}

function emptyCluster(meta: { key: string; theme: string; skillSlug: string }): SkillGapCluster {
  return {
    key: meta.key,
    theme: meta.theme,
    skillSlug: meta.skillSlug,
    count: 0,
    sessionIds: [],
    titles: [],
    details: [],
  };
}

/**
 * If the current session's instruction findings match a gap seen in at least
 * `threshold` recent graded sessions, return that cluster.
 */
export function findSkillGapCluster(
  currentFindings: SessionGradeFinding[],
  sessions: SkillGapSessionInput[],
  threshold = SKILL_GAP_CLUSTER_THRESHOLD,
): SkillGapCluster | null {
  const buckets = new Map<string, SkillGapCluster>();
  for (const session of sessions) {
    const seenKeys = new Set<string>();
    for (const finding of session.findings.filter(isInstructionGapFinding)) {
      const meta = skillGapClusterKey(finding);
      if (seenKeys.has(meta.key)) continue;
      seenKeys.add(meta.key);
      const bucket = buckets.get(meta.key) ?? emptyCluster(meta);
      bucket.count += 1;
      bucket.sessionIds.push(session.id);
      if (finding.title && !bucket.titles.includes(finding.title)) {
        bucket.titles.push(finding.title);
      }
      const detail = `${finding.title}: ${finding.detail}`.trim();
      if (detail && !bucket.details.includes(detail)) bucket.details.push(detail);
      buckets.set(meta.key, bucket);
    }
  }

  const currentKeys = new Set(
    currentFindings.filter(isInstructionGapFinding).map((finding) => skillGapClusterKey(finding).key),
  );
  let best: SkillGapCluster | null = null;
  for (const cluster of buckets.values()) {
    if (cluster.count < threshold || !currentKeys.has(cluster.key)) continue;
    if (!best || cluster.count > best.count) best = cluster;
  }
  return best;
}
