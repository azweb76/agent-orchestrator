import type {
  SkillEfficiencySnapshot,
  SkillMetricsComparison,
} from '@agent-orchestrator/shared';
import { compareSkillSnapshots } from '@agent-orchestrator/shared';
import type { AppContext } from './app-context.js';

const METRICS_KEY = (workspaceId: string, skillSlug: string) =>
  `skill-metrics:${workspaceId}:${skillSlug}`;

export function getSkillEfficiencySnapshot(
  ctx: AppContext,
  workspaceId: string,
  skillSlug: string,
): SkillEfficiencySnapshot | null {
  const raw = ctx.repos.automationState.get(METRICS_KEY(workspaceId, skillSlug));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SkillEfficiencySnapshot;
  } catch {
    return null;
  }
}

export function setSkillEfficiencySnapshot(
  ctx: AppContext,
  workspaceId: string,
  snapshot: SkillEfficiencySnapshot,
): void {
  ctx.repos.automationState.set(
    METRICS_KEY(workspaceId, snapshot.skillSlug),
    JSON.stringify(snapshot),
  );
}

/** Record the latest grade stats for a skill and return previous→current comparison. */
export function recordSkillGradeMetrics(
  ctx: AppContext,
  workspaceId: string,
  snapshot: SkillEfficiencySnapshot,
): SkillMetricsComparison {
  const previous = getSkillEfficiencySnapshot(ctx, workspaceId, snapshot.skillSlug);
  setSkillEfficiencySnapshot(ctx, workspaceId, snapshot);
  return compareSkillSnapshots(previous, snapshot);
}
