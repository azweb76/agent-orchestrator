import {
  extractPlanFilePath,
  extractPlanFilePathsFromLog,
} from '@agent-orchestrator/shared';
import { readFileSync } from 'node:fs';

/** Load ExitPlanMode plan text from disk when the CLI omits inline plan. */
export function enrichPermissionInput(
  toolName: string,
  input: Record<string, unknown>,
  options: { logPath?: string } = {},
): Record<string, unknown> {
  if (toolName !== 'ExitPlanMode') return input;
  if (typeof input.plan === 'string' && input.plan.trim()) {
    return input;
  }

  // `~/.claude/plans/` is a single directory shared by every agent on the
  // machine, and plan filenames carry no agent/session identifier (they're a
  // content-derived slug). There is no way to verify a file found there
  // belongs to this requesting agent, so it is intentionally never scanned
  // for candidates here — the only trustworthy candidates are ones explicitly
  // tied to this agent's own tool input or its own run log.
  const candidates: string[] = [];
  const inlinePath = extractPlanFilePath(input);
  if (inlinePath) candidates.push(inlinePath);

  if (options.logPath) {
    try {
      candidates.push(...extractPlanFilePathsFromLog(readFileSync(options.logPath, 'utf8')));
    } catch {
      // log may not exist yet
    }
  }

  for (const filePath of candidates) {
    try {
      const text = readFileSync(filePath, 'utf8');
      if (text.trim()) {
        return { ...input, plan: text.trim(), planFilePath: filePath };
      }
    } catch {
      // try the next candidate
    }
  }

  return input;
}
