import {
  extractPlanFilePath,
  extractPlanFilePathsFromLog,
} from '@agent-orchestrator/shared';
import {
  readdirSync,
  readFileSync,
  statSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Load ExitPlanMode plan text from disk when the CLI omits inline plan. */
export function enrichPermissionInput(
  toolName: string,
  input: Record<string, unknown>,
  options: { logPath?: string; plansDir?: string } = {},
): Record<string, unknown> {
  if (toolName !== 'ExitPlanMode') return input;
  if (typeof input.plan === 'string' && input.plan.trim()) {
    return input;
  }

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

  for (const filePath of listRecentClaudePlanFiles(options.plansDir)) {
    if (!candidates.includes(filePath)) candidates.push(filePath);
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

export function claudePlansDirectory(): string {
  return path.join(os.homedir(), '.claude', 'plans');
}

function listRecentClaudePlanFiles(plansDir?: string): string[] {
  const dir = plansDir ?? claudePlansDirectory();
  try {
    const cutoff = Date.now() - 6 * 60 * 60 * 1000;
    return readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.md') && !entry.name.includes('-agent-'))
      .map((entry) => {
        const filePath = path.join(dir, entry.name);
        return { filePath, mtime: statSync(filePath).mtimeMs };
      })
      .filter((entry) => entry.mtime >= cutoff)
      .sort((a, b) => b.mtime - a.mtime)
      .map((entry) => entry.filePath);
  } catch {
    return [];
  }
}
