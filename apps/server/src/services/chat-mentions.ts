import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { ChatMention } from '@agent-orchestrator/shared';
import type { GitService } from './git.js';

const execFileAsync = promisify(execFile);

export const CHAT_MENTION_MAX_FILE_BYTES = 100_000;
export const CHAT_MENTION_MAX_TOTAL_BYTES = 500_000;
export const CHAT_MENTION_MAX_DIFF_BYTES = 200_000;

const SENSITIVE_BASENAMES = new Set([
  '.env',
  '.git-credentials',
  'id_rsa',
  'id_dsa',
  'id_ecdsa',
  'id_ed25519',
]);
const SENSITIVE_EXTENSIONS = new Set(['.pem', '.key', '.p12', '.pfx']);

export interface MentionResolutionNote {
  token: string;
  note: string;
}

export interface MentionResolutionResult {
  context: string;
  notes: MentionResolutionNote[];
}

export function isSensitiveMentionPath(relativePath: string): boolean {
  const normalized = relativePath.replace(/\\/g, '/');
  const basename = path.posix.basename(normalized).toLowerCase();
  if (SENSITIVE_BASENAMES.has(basename)) return true;
  if (basename.startsWith('.env.')) return true;
  if (basename.includes('credentials') || basename.includes('secret')) return true;
  const ext = path.posix.extname(basename);
  return SENSITIVE_EXTENSIONS.has(ext);
}

/** Resolve a repo-relative path inside the worktree; rejects path escape. */
export function resolveWorktreeFilePath(worktreeRoot: string, relativePath: string): string | null {
  const normalized = relativePath.replace(/\\/g, '/').replace(/^\.\/+/, '').trim();
  if (!normalized || normalized.includes('\0')) return null;
  if (path.isAbsolute(normalized)) return null;
  if (normalized.split('/').some((segment) => segment === '..')) return null;

  const absRoot = path.resolve(worktreeRoot);
  const absPath = path.resolve(absRoot, normalized);
  if (absPath !== absRoot && !absPath.startsWith(`${absRoot}${path.sep}`)) return null;
  return absPath;
}

export async function listWorktreeFiles(worktreePath: string): Promise<string[]> {
  const { stdout } = await execFileAsync(
    'git',
    ['-C', worktreePath, 'ls-files', '-co', '--exclude-standard', '-z'],
    { maxBuffer: 10 * 1024 * 1024 },
  );
  return stdout
    .split('\0')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
}

function truncateText(text: string, maxBytes: number): { text: string; truncated: boolean } {
  const buffer = Buffer.from(text, 'utf8');
  if (buffer.length <= maxBytes) return { text, truncated: false };
  let end = maxBytes;
  while (end > 0 && (buffer[end]! & 0xc0) === 0x80) end -= 1;
  return { text: buffer.subarray(0, end).toString('utf8'), truncated: true };
}

export async function resolveChatMentions(
  git: GitService,
  worktreePath: string,
  mentions: ChatMention[] | undefined,
): Promise<MentionResolutionResult> {
  if (!mentions?.length) return { context: '', notes: [] };

  const sections: string[] = [];
  const notes: MentionResolutionNote[] = [];
  let totalBytes = 0;

  for (const mention of mentions) {
    if (mention.kind === 'diff') {
      const token = '@diff';
      const remaining = CHAT_MENTION_MAX_TOTAL_BYTES - totalBytes;
      if (remaining <= 0) {
        notes.push({ token, note: 'skipped (@diff too large for remaining mention budget)' });
        continue;
      }
      const maxDiff = Math.min(CHAT_MENTION_MAX_DIFF_BYTES, remaining);
      const { stat, patch } = await git.getDiff(worktreePath);
      const diffBody = [stat ? `diff --stat:\n${stat}` : '', patch ? `patch:\n${patch}` : '']
        .filter(Boolean)
        .join('\n\n');
      if (!diffBody.trim()) {
        notes.push({ token, note: 'no pending diff in worktree' });
        continue;
      }
      const clipped = truncateText(diffBody, maxDiff);
      totalBytes += Buffer.byteLength(clipped.text, 'utf8');
      sections.push(
        `### ${token}\n\`\`\`diff\n${clipped.text}${clipped.truncated ? '\n… [truncated]' : ''}\n\`\`\``,
      );
      if (clipped.truncated) {
        notes.push({ token, note: 'diff truncated to mention size cap' });
      }
      continue;
    }

    const relativePath = mention.path?.trim();
    const token = relativePath ? `@${relativePath}` : '@file';
    if (!relativePath) {
      notes.push({ token, note: 'missing file path' });
      continue;
    }
    if (isSensitiveMentionPath(relativePath)) {
      notes.push({ token, note: 'skipped (sensitive file)' });
      continue;
    }

    const absPath = resolveWorktreeFilePath(worktreePath, relativePath);
    if (!absPath) {
      notes.push({ token, note: 'skipped (invalid path)' });
      continue;
    }

    let fileText: string;
    try {
      const stat = await fs.stat(absPath);
      if (!stat.isFile()) {
        notes.push({ token, note: 'not a file' });
        continue;
      }
      if (stat.size > CHAT_MENTION_MAX_FILE_BYTES) {
        notes.push({ token, note: 'skipped (file too large)' });
        continue;
      }
      fileText = await fs.readFile(absPath, 'utf8');
    } catch {
      notes.push({ token, note: 'file not found' });
      continue;
    }

    const remaining = CHAT_MENTION_MAX_TOTAL_BYTES - totalBytes;
    if (remaining <= 0) {
      notes.push({ token, note: 'skipped (mention budget exhausted)' });
      continue;
    }
    const clipped = truncateText(fileText, Math.min(CHAT_MENTION_MAX_FILE_BYTES, remaining));
    totalBytes += Buffer.byteLength(clipped.text, 'utf8');
    sections.push(
      `### ${token}\n\`\`\`\n${clipped.text}${clipped.truncated ? '\n… [truncated]' : ''}\n\`\`\``,
    );
    if (clipped.truncated) {
      notes.push({ token, note: 'file truncated to mention size cap' });
    }
  }

  if (notes.length > 0) {
    const noteLines = notes.map((item) => `- ${item.token}: ${item.note}`);
    sections.push(`### Mention notes\n${noteLines.join('\n')}`);
  }

  if (sections.length === 0) return { context: '', notes };
  return {
    context: `Attached @-mention context:\n\n${sections.join('\n\n')}`,
    notes,
  };
}
