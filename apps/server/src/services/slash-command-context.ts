import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { v4 as uuidv4 } from 'uuid';
import {
  chatSessionTemplateById,
  uniqueSessionTitle,
  type Agent,
  type ChatSession,
  type GitHubPullRequest,
  type PullRequestCheck,
} from '@agent-orchestrator/shared';
import type { AppRepositories } from '../db/index.js';
import type { GitService } from './git.js';
import type { GitHubService } from './github.js';
import { resolveChatMentions } from './chat-mentions.js';

const execFileAsync = promisify(execFile);

export const SLASH_TEST_OUTPUT_MAX_BYTES = 32_000;
export const SLASH_TEST_TIMEOUT_MS = 120_000;
export const SLASH_PR_CONTEXT_MAX_CHARS = 14_000;

const CONTEXT_COMMANDS = new Set(['/diff', '/test', '/pr', '/code-review', '/review']);

const DIFF_PROMPT =
  'Show a summary of the current git diff and what still needs work.';
const TEST_PROMPT =
  'Run the relevant tests for recent changes and fix any failures.';
const PR_PROMPT =
  'Prepare a pull request: summarize changes, suggest a title and description.';

export interface SlashCommandContextDeps {
  repos: AppRepositories;
  git: GitService;
  github: GitHubService;
}

export interface SlashCommandResolution {
  handled: boolean;
  displayMessage: string;
  prompt: string;
  mentionContext?: string;
  sessionSwitch?: ChatSession;
}

export function parseSlashCommandToken(
  message: string,
): { command: string; args: string } | null {
  const trimmed = message.trim();
  if (!trimmed.startsWith('/')) return null;
  const [first, ...rest] = trimmed.split(/\s+/);
  if (!first) return null;
  return { command: first.toLowerCase(), args: rest.join(' ').trim() };
}

export function isContextSlashCommand(message: string): boolean {
  const parsed = parseSlashCommandToken(message);
  return parsed ? CONTEXT_COMMANDS.has(parsed.command) : false;
}

function appendArgs(prompt: string, args: string): string {
  if (!args) return prompt;
  return `${prompt}\n\n${args}`;
}

function truncateText(text: string, maxBytes: number): string {
  const buffer = Buffer.from(text, 'utf8');
  if (buffer.length <= maxBytes) return text;
  let end = maxBytes;
  while (end > 0 && (buffer[end]! & 0xc0) === 0x80) end -= 1;
  return `${buffer.subarray(0, end).toString('utf8')}\n… [output truncated]`;
}

function capLength(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 24)}\n\n…(context truncated)…`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function findOrCreateReviewSession(deps: SlashCommandContextDeps, agent: Agent): ChatSession {
  const sessions = deps.repos.sessions.listByAgent(agent.id);
  const existing = sessions.find((item) => item.template === 'review');
  if (existing) return existing;

  const template = chatSessionTemplateById('review');
  const timestamp = nowIso();
  const title = uniqueSessionTitle(
    sessions.map((item) => item.title),
    template?.title ?? 'Review',
  );
  const session: ChatSession = {
    id: uuidv4(),
    agentId: agent.id,
    title,
    template: 'review',
    status: 'idle',
    model: agent.model,
    effort: agent.effort,
    permissionMode: template?.permissionMode ?? 'plan',
    claudeSessionId: null,
    pid: null,
    runLogPath: null,
    createdAt: timestamp,
    updatedAt: timestamp,
    titleSource: 'default',
  };
  deps.repos.sessions.create(session);
  return session;
}

async function resolveDiffContext(
  deps: SlashCommandContextDeps,
  worktreePath: string,
  args: string,
): Promise<SlashCommandResolution> {
  const mentionResult = await resolveChatMentions(deps.git, worktreePath, [{ kind: 'diff' }]);
  return {
    handled: true,
    displayMessage: args ? `/diff ${args}` : '/diff',
    prompt: appendArgs(DIFF_PROMPT, args),
    mentionContext: mentionResult.context || undefined,
  };
}

async function discoverTestCommand(worktreePath: string): Promise<string | null> {
  const pkgPath = path.join(worktreePath, 'package.json');
  try {
    const raw = await fs.readFile(pkgPath, 'utf8');
    const pkg = JSON.parse(raw) as { scripts?: Record<string, string> };
    if (pkg.scripts?.test?.trim()) {
      if (existsSync(path.join(worktreePath, 'pnpm-lock.yaml'))) return 'pnpm test';
      if (existsSync(path.join(worktreePath, 'yarn.lock'))) return 'yarn test';
      return 'npm test';
    }
  } catch {
    // ignore missing or invalid package.json
  }

  const agentsPath = path.join(worktreePath, 'AGENTS.md');
  try {
    const content = await fs.readFile(agentsPath, 'utf8');
    for (const match of content.matchAll(/```(?:bash|sh)?\n([\s\S]*?)```/g)) {
      for (const line of match[1]!.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        if (/\btest\b/i.test(trimmed)) return trimmed;
      }
    }
  } catch {
    // ignore missing AGENTS.md
  }

  return null;
}

async function runWorktreeTestCommand(
  worktreePath: string,
  command: string,
): Promise<{ exitCode: number | null; output: string }> {
  try {
    const { stdout, stderr } = await execFileAsync(command, {
      cwd: worktreePath,
      shell: true,
      timeout: SLASH_TEST_TIMEOUT_MS,
      maxBuffer: SLASH_TEST_OUTPUT_MAX_BYTES + 4_096,
      env: { ...process.env, CI: 'true' },
    });
    const combined = [stdout, stderr].filter(Boolean).join('\n').trim();
    return { exitCode: 0, output: combined || '(no output)' };
  } catch (error) {
    const err = error as NodeJS.ErrnoException & { stdout?: string; stderr?: string; code?: number };
    const combined = [err.stdout, err.stderr].filter(Boolean).join('\n').trim();
    const exitCode = typeof err.code === 'number' ? err.code : null;
    return {
      exitCode,
      output: combined || err.message || 'Test command failed',
    };
  }
}

async function resolveTestContext(
  worktreePath: string,
  args: string,
): Promise<SlashCommandResolution> {
  const command = await discoverTestCommand(worktreePath);
  if (!command) {
    return {
      handled: true,
      displayMessage: args ? `/test ${args}` : '/test',
      prompt: appendArgs(
        'No workspace test script was found (package.json scripts.test or AGENTS.md test command).',
        args,
      ),
    };
  }

  const result = await runWorktreeTestCommand(worktreePath, command);
  const output = truncateText(result.output, SLASH_TEST_OUTPUT_MAX_BYTES);
  const status =
    result.exitCode === 0
      ? 'Tests finished successfully.'
      : `Tests failed (exit code ${result.exitCode ?? 'unknown'}).`;
  const body = [
    TEST_PROMPT,
    '',
    `Ran: \`${command}\``,
    status,
    '',
    '### Test output',
    '```',
    output,
    '```',
  ].join('\n');

  return {
    handled: true,
    displayMessage: args ? `/test ${args}` : '/test',
    prompt: appendArgs(body, args),
  };
}

function formatCheckLine(check: PullRequestCheck): string {
  const url = check.detailsUrl ? ` ${check.detailsUrl}` : '';
  return `- **${check.name}** (${check.conclusion ?? check.status})${url}`;
}

function formatPrContext(
  pr: GitHubPullRequest,
  branch: string,
  body: string,
  checks: PullRequestCheck[],
): string {
  const lines = [
    '## Pull request context',
    `PR #${pr.number} (open): ${pr.title}`,
    pr.htmlUrl,
    `Branch \`${branch}\` → \`${pr.baseRef}\``,
    '',
    '### Description',
    body.trim() || '(empty)',
  ];

  if (checks.length > 0) {
    lines.push('', '### Checks');
    for (const check of checks) {
      lines.push(formatCheckLine(check));
    }
  }

  return lines.join('\n');
}

async function resolvePrContext(
  deps: SlashCommandContextDeps,
  workspace: { githubOwner: string; githubRepo: string },
  worktree: { branch: string },
  args: string,
): Promise<SlashCommandResolution> {
  const pr = await deps.github.getOpenPullRequestForBranch(
    workspace.githubOwner,
    workspace.githubRepo,
    worktree.branch,
  );
  if (!pr) {
    return {
      handled: true,
      displayMessage: args ? `/pr ${args}` : '/pr',
      prompt: appendArgs(
        `No open pull request was found for branch \`${worktree.branch}\`.`,
        args,
      ),
    };
  }

  const detail = await deps.github.getPullRequestDetail(
    workspace.githubOwner,
    workspace.githubRepo,
    pr.number,
  );
  const checks = await deps.github.getPullRequestChecks(
    workspace.githubOwner,
    workspace.githubRepo,
    detail.headSha,
  );
  const context = capLength(
    formatPrContext(pr, worktree.branch, detail.body ?? '', checks.checks),
    SLASH_PR_CONTEXT_MAX_CHARS,
  );

  return {
    handled: true,
    displayMessage: args ? `/pr ${args}` : '/pr',
    prompt: appendArgs(PR_PROMPT, args),
    mentionContext: context,
  };
}

async function resolveCodeReviewContext(
  deps: SlashCommandContextDeps,
  agent: Agent,
  worktreePath: string,
  args: string,
): Promise<SlashCommandResolution> {
  const template = chatSessionTemplateById('review');
  const basePrompt = template?.prompt ?? 'Review the current changes for bugs, edge cases, and missing tests.';
  const mentionResult = await resolveChatMentions(deps.git, worktreePath, [{ kind: 'diff' }]);
  const reviewSession = findOrCreateReviewSession(deps, agent);

  return {
    handled: true,
    displayMessage: args ? `/code-review ${args}` : '/code-review',
    prompt: appendArgs(basePrompt, args),
    mentionContext: mentionResult.context || undefined,
    sessionSwitch: reviewSession,
  };
}

export async function resolveSlashCommandContext(
  deps: SlashCommandContextDeps,
  agent: Agent,
  worktreePath: string,
  workspace: { githubOwner: string; githubRepo: string } | null,
  worktree: { branch: string } | null,
  message: string,
): Promise<SlashCommandResolution> {
  const parsed = parseSlashCommandToken(message);
  if (!parsed || !CONTEXT_COMMANDS.has(parsed.command)) {
    return { handled: false, displayMessage: message, prompt: message };
  }

  switch (parsed.command) {
    case '/diff':
      return resolveDiffContext(deps, worktreePath, parsed.args);
    case '/test':
      return resolveTestContext(worktreePath, parsed.args);
    case '/pr':
      if (!workspace || !worktree) {
        return {
          handled: true,
          displayMessage: parsed.args ? `/pr ${parsed.args}` : '/pr',
          prompt: appendArgs('Workspace GitHub metadata is unavailable for PR lookup.', parsed.args),
        };
      }
      return resolvePrContext(deps, workspace, worktree, parsed.args);
    case '/code-review':
    case '/review':
      return resolveCodeReviewContext(deps, agent, worktreePath, parsed.args);
    default:
      return { handled: false, displayMessage: message, prompt: message };
  }
}
