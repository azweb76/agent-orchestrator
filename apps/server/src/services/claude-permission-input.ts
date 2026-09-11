import { extractPlanFilePathsFromLog } from '@agent-orchestrator/shared';
import { readFileSync } from 'node:fs';

function findPlanFileOnDisk(
  options: { logPath?: string },
  expectedText?: string,
): { filePath: string; text: string } | null {
  // `~/.claude/plans/` is a single directory shared by every agent on the
  // machine, and plan filenames carry no agent/session identifier (they're a
  // content-derived slug). There is no way to verify a file found there
  // belongs to this requesting agent, so it is intentionally never scanned
  // for candidates here — the only trustworthy candidates are ones explicitly
  // tied to this agent's own tool input or its own run log.
  //
  // `input.planFilePath` is also never a candidate source here: the only
  // caller (`enrichPermissionInput`) already short-circuits before reaching
  // this function whenever `input.planFilePath` is set.
  const candidates: string[] = [];

  if (options.logPath) {
    try {
      candidates.push(...extractPlanFilePathsFromLog(readFileSync(options.logPath, 'utf8')));
    } catch {
      // log may not exist yet
    }
  }

  for (const filePath of candidates) {
    try {
      const text = readFileSync(filePath, 'utf8').trim();
      if (!text) continue;
      // When an inline plan is already known, only trust a candidate whose
      // on-disk content matches it — otherwise a stale/older plan revision
      // could be paired with newer inline plan text.
      if (expectedText !== undefined && text !== expectedText) continue;
      return { filePath, text };
    } catch {
      // try the next candidate
    }
  }

  return null;
}

/** Load ExitPlanMode plan text from disk when the CLI omits inline plan. */
export function enrichPermissionInput(
  toolName: string,
  input: Record<string, unknown>,
  options: { logPath?: string } = {},
): Record<string, unknown> {
  if (toolName !== 'ExitPlanMode') return input;
  // Already resolved by an earlier enrichment (e.g. re-processing a stashed or
  // replayed request) — skip the disk scan entirely.
  if (typeof input.planFilePath === 'string' && input.planFilePath.trim()) return input;
  const inlinePlan = typeof input.plan === 'string' ? input.plan.trim() : '';
  const found = findPlanFileOnDisk(options, inlinePlan || undefined);
  if (!found) return input;
  return inlinePlan
    ? { ...input, planFilePath: found.filePath }
    : { ...input, plan: found.text, planFilePath: found.filePath };
}
