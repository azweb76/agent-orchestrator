import { existsSync, readdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** Claude Code stores transcripts under `<configDir>/projects/<encoded-cwd>/<sessionId>.jsonl`. */
export function encodeClaudeProjectDir(cwd: string): string {
  return path.resolve(cwd).replace(/[^A-Za-z0-9]/g, '-');
}

export function claudeConfigDirs(configDir?: string): string[] {
  const override = configDir?.trim() || process.env.CLAUDE_CONFIG_DIR?.trim();
  if (override) return [override];
  return [path.join(os.homedir(), '.claude'), path.join(os.homedir(), '.config', 'claude')];
}

function projectDirNames(cwd: string): string[] {
  // Claude Code only honors CLAUDE_CODE_PROJECT_DIR_NAME when CLAUDE_CONFIG_DIR is set.
  const named = process.env.CLAUDE_CONFIG_DIR?.trim()
    ? process.env.CLAUDE_CODE_PROJECT_DIR_NAME?.trim()
    : undefined;
  const encoded = encodeClaudeProjectDir(cwd);
  const slashEncoded = path.resolve(cwd).replace(/[/\\:]+/g, '-');
  return [...new Set([named, encoded, slashEncoded].filter((item): item is string => Boolean(item)))];
}

function sessionFileCandidates(cwd: string, sessionId: string, configDir: string): string[] {
  const name = `${sessionId}.jsonl`;
  const files: string[] = [];
  for (const project of projectDirNames(cwd)) {
    files.push(path.join(configDir, 'projects', project, name));
    files.push(path.join(configDir, 'projects', project, 'sessions', name));
  }
  return files;
}

function findSessionJsonl(projectsDir: string, sessionId: string): string | null {
  const name = `${sessionId}.jsonl`;
  try {
    for (const entry of readdirSync(projectsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const projectPath = path.join(projectsDir, entry.name);
      const direct = path.join(projectPath, name);
      if (existsSync(direct)) return direct;
      const nested = path.join(projectPath, 'sessions', name);
      if (existsSync(nested)) return nested;
    }
  } catch {
    return null;
  }
  return null;
}

export interface ResolveClaudeSessionFileInput {
  cwd: string;
  sessionId?: string | null;
  runLogPath?: string | null;
  configDir?: string;
}

/**
 * Locate the Claude Code session JSONL for this chat, falling back to the
 * orchestrator run log when the transcript file is not on disk.
 */
export function resolveClaudeSessionFilePath(input: ResolveClaudeSessionFileInput): string | null {
  const sessionId = input.sessionId?.trim();
  if (sessionId) {
    for (const configDir of claudeConfigDirs(input.configDir)) {
      for (const candidate of sessionFileCandidates(input.cwd, sessionId, configDir)) {
        if (existsSync(candidate)) return candidate;
      }
      const found = findSessionJsonl(path.join(configDir, 'projects'), sessionId);
      if (found) return found;
    }
  }

  const runLog = input.runLogPath?.trim();
  if (runLog && existsSync(runLog)) return runLog;
  return null;
}
