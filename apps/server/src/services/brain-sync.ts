import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import type {
  BrainSyncConfig,
  BrainSyncStatus,
  ConnectBrainRepoRequest,
  CreateBrainPullRequestRequest,
} from '@agent-orchestrator/shared';
import { EMPTY_BRAIN_SYNC_STATUS } from '@agent-orchestrator/shared';
import { parseGitHubUrl } from './repo-slug.js';
import { type AppContext, nowIso } from './app-context.js';
import {
  brainRepoHasCatalog,
  importBrainRepo,
  materializeBrainRepo,
} from './brain-sync-files.js';

const execFileAsync = promisify(execFile);

const KEYS = {
  repoUrl: 'brain_repo_url',
  githubOwner: 'brain_github_owner',
  githubRepo: 'brain_github_repo',
  defaultBranch: 'brain_default_branch',
  lastPrNumber: 'brain_last_pr_number',
  lastPrUrl: 'brain_last_pr_url',
} as const;

export function brainRepoPath(ctx: AppContext): string {
  return path.join(ctx.dataDir, 'brain');
}

export function parseBrainRepoRef(repoUrl: string): {
  cloneUrl: string;
  githubOwner: string;
  githubRepo: string;
  isGitHub: boolean;
} {
  const trimmed = repoUrl.trim();
  if (!trimmed) throw new Error('Repository URL is required');
  // A leading dash would reach git as an option rather than an operand.
  if (trimmed.startsWith('-')) throw new Error('Invalid repository URL');

  const short = trimmed.match(/^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?$/);
  if (short && !trimmed.includes(':') && !trimmed.includes('\\')) {
    const owner = short[1]!;
    const repo = short[2]!;
    return {
      cloneUrl: `https://github.com/${owner}/${repo}.git`,
      githubOwner: owner,
      githubRepo: repo,
      isGitHub: true,
    };
  }
  try {
    const { owner, repo } = parseGitHubUrl(trimmed);
    return { cloneUrl: trimmed, githubOwner: owner, githubRepo: repo, isGitHub: true };
  } catch {
    // Previously any unparseable string became the clone URL verbatim. git reads
    // some operand values as transports that run a helper command rather than as
    // network URLs, so a non-GitHub value must be an explicit local repository:
    // a file:// URL or an absolute path, and nothing else.
    const fileUrl = /^file:\/\//i.test(trimmed);
    if (!fileUrl && !path.isAbsolute(trimmed)) {
      throw new Error(
        'Repository must be a GitHub URL (owner/repo, https://github.com/…, ' +
          'git@github.com:…), a file:// URL, or an absolute local path',
      );
    }
    const localPath = fileUrl ? new URL(trimmed).pathname : trimmed;
    const base = path.basename(localPath).replace(/\.git$/, '') || 'brain';
    return { cloneUrl: trimmed, githubOwner: 'local', githubRepo: base, isGitHub: false };
  }
}

export function getBrainSyncConfig(ctx: AppContext): BrainSyncConfig | null {
  const repoUrl = ctx.repos.settings.get(KEYS.repoUrl);
  const githubOwner = ctx.repos.settings.get(KEYS.githubOwner);
  const githubRepo = ctx.repos.settings.get(KEYS.githubRepo);
  if (!repoUrl || !githubOwner || !githubRepo) return null;
  const lastPrNumberRaw = ctx.repos.settings.get(KEYS.lastPrNumber);
  const lastPrNumber = lastPrNumberRaw ? Number.parseInt(lastPrNumberRaw, 10) : NaN;
  return {
    repoUrl,
    githubOwner,
    githubRepo,
    defaultBranch: ctx.repos.settings.get(KEYS.defaultBranch) || 'main',
    lastPrNumber: Number.isFinite(lastPrNumber) ? lastPrNumber : null,
    lastPrUrl: ctx.repos.settings.get(KEYS.lastPrUrl),
  };
}

function saveBrainSyncConfig(ctx: AppContext, config: BrainSyncConfig): void {
  ctx.repos.settings.set(KEYS.repoUrl, config.repoUrl);
  ctx.repos.settings.set(KEYS.githubOwner, config.githubOwner);
  ctx.repos.settings.set(KEYS.githubRepo, config.githubRepo);
  ctx.repos.settings.set(KEYS.defaultBranch, config.defaultBranch);
  if (config.lastPrNumber != null) ctx.repos.settings.set(KEYS.lastPrNumber, String(config.lastPrNumber));
  else ctx.repos.settings.delete(KEYS.lastPrNumber);
  if (config.lastPrUrl) ctx.repos.settings.set(KEYS.lastPrUrl, config.lastPrUrl);
  else ctx.repos.settings.delete(KEYS.lastPrUrl);
}

function clearBrainSyncConfig(ctx: AppContext): void {
  for (const key of Object.values(KEYS)) ctx.repos.settings.delete(key);
}

async function ensureCommitIdentity(repoPath: string): Promise<void> {
  try {
    const { stdout } = await execFileAsync('git', ['-C', repoPath, 'config', 'user.email']);
    if (stdout.trim()) return;
  } catch {
    // missing
  }
  await execFileAsync('git', ['-C', repoPath, 'config', 'user.email', 'orchestrator@local']);
  await execFileAsync('git', ['-C', repoPath, 'config', 'user.name', 'Agent Orchestrator']);
}

export async function getBrainSyncStatus(
  ctx: AppContext,
  options: { homeDir?: string; fetchRemote?: boolean } = {},
): Promise<BrainSyncStatus> {
  const config = getBrainSyncConfig(ctx);
  if (!config) return { ...EMPTY_BRAIN_SYNC_STATUS };

  const repoPath = brainRepoPath(ctx);
  try {
    await fs.access(path.join(repoPath, '.git'));
  } catch {
    return {
      ...EMPTY_BRAIN_SYNC_STATUS,
      configured: true,
      repoUrl: config.repoUrl,
      githubOwner: config.githubOwner,
      githubRepo: config.githubRepo,
      defaultBranch: config.defaultBranch,
      isGitHub: config.githubOwner !== 'local',
      lastPrNumber: config.lastPrNumber,
      lastPrUrl: config.lastPrUrl,
      checkedAt: nowIso(),
    };
  }

  await materializeBrainRepo(ctx, repoPath, options.homeDir);
  if (options.fetchRemote !== false) {
    try {
      await ctx.git.fetch(repoPath);
    } catch {
      // offline: still report local dirty/ahead
    }
  }

  const branch = config.defaultBranch;
  const remoteRef = `origin/${branch}`;
  const localSha = await ctx.git.resolveSha(repoPath, 'HEAD');
  const remoteSha = await ctx.git.resolveSha(repoPath, remoteRef);
  let aheadBy = 0;
  let behindBy = 0;
  if (localSha && remoteSha) {
    const counts = await ctx.git.getAheadBehind(repoPath, 'HEAD', remoteRef);
    aheadBy = counts.ahead;
    behindBy = counts.behind;
  } else if (!localSha && remoteSha) {
    behindBy = 1;
  }

  const dirty = await ctx.git.hasChanges(repoPath);
  const changedFiles = dirty ? await ctx.git.listChangedFiles(repoPath) : [];

  return {
    configured: true,
    repoUrl: config.repoUrl,
    githubOwner: config.githubOwner,
    githubRepo: config.githubRepo,
    defaultBranch: branch,
    isGitHub: config.githubOwner !== 'local',
    dirty,
    aheadBy,
    behindBy,
    changedFiles,
    localSha,
    remoteSha,
    lastPrNumber: config.lastPrNumber,
    lastPrUrl: config.lastPrUrl,
    checkedAt: nowIso(),
  };
}

export async function connectBrainRepo(
  ctx: AppContext,
  body: ConnectBrainRepoRequest,
  homeDir?: string,
): Promise<BrainSyncStatus> {
  const ref = parseBrainRepoRef(body.repoUrl);
  const repoPath = brainRepoPath(ctx);
  await fs.rm(repoPath, { recursive: true, force: true });
  await ctx.git.clone(ref.cloneUrl, repoPath);

  let defaultBranch = 'main';
  try {
    defaultBranch = await ctx.git.getDefaultBranch(repoPath);
  } catch {
    try {
      const current = await ctx.git.getCurrentBranch(repoPath);
      if (current) defaultBranch = current;
    } catch {
      // keep main
    }
  }

  saveBrainSyncConfig(ctx, {
    repoUrl: ref.cloneUrl,
    githubOwner: ref.githubOwner,
    githubRepo: ref.githubRepo,
    defaultBranch,
    lastPrNumber: null,
    lastPrUrl: null,
  });
  await ensureCommitIdentity(repoPath);

  if (await brainRepoHasCatalog(repoPath)) {
    await importBrainRepo(ctx, repoPath, homeDir);
  } else {
    await materializeBrainRepo(ctx, repoPath, homeDir);
  }

  return getBrainSyncStatus(ctx, { homeDir, fetchRemote: false });
}

export async function disconnectBrainRepo(ctx: AppContext): Promise<BrainSyncStatus> {
  await fs.rm(brainRepoPath(ctx), { recursive: true, force: true });
  clearBrainSyncConfig(ctx);
  return { ...EMPTY_BRAIN_SYNC_STATUS };
}

export async function pullBrainRepo(
  ctx: AppContext,
  homeDir?: string,
): Promise<BrainSyncStatus> {
  const config = getBrainSyncConfig(ctx);
  if (!config) throw new Error('No brain repository connected');
  const repoPath = brainRepoPath(ctx);
  const before = await getBrainSyncStatus(ctx, { homeDir, fetchRemote: true });
  if (before.behindBy <= 0) {
    return before;
  }
  if (before.dirty) {
    throw new Error(
      'Local brain library has uncommitted changes. Create a pull request first, or wait until the working tree is clean.',
    );
  }
  const current = await ctx.git.getCurrentBranch(repoPath);
  await ctx.git.updateBranchToRef(repoPath, config.defaultBranch, `origin/${config.defaultBranch}`);
  if (current !== config.defaultBranch) {
    await ctx.git.checkout(repoPath, config.defaultBranch);
  }
  await importBrainRepo(ctx, repoPath, homeDir);
  return getBrainSyncStatus(ctx, { homeDir, fetchRemote: false });
}

export async function createBrainPullRequest(
  ctx: AppContext,
  body: CreateBrainPullRequestRequest,
  homeDir?: string,
): Promise<{ number: number; htmlUrl: string; status: BrainSyncStatus }> {
  const config = getBrainSyncConfig(ctx);
  if (!config) throw new Error('No brain repository connected');
  if (config.githubOwner === 'local') {
    throw new Error('Pull requests require a GitHub repository');
  }
  const title = body.title.trim();
  if (!title) throw new Error('Title is required');

  const repoPath = brainRepoPath(ctx);
  await getBrainSyncStatus(ctx, { homeDir, fetchRemote: true });
  const dirty = await ctx.git.hasChanges(repoPath);
  if (!dirty) {
    throw new Error('No modified brain files to publish');
  }

  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, '').replace('T', '-');
  const branch = `brain-sync-${stamp}`;
  await ensureCommitIdentity(repoPath);
  await ctx.git.checkoutNewBranch(repoPath, branch);
  await ctx.git.commitAll(repoPath, title);
  await ctx.git.pushBranch(repoPath, branch);

  const draft = body.draft ?? true;
  const pr = await ctx.github.createPullRequest(config.githubOwner, config.githubRepo, {
    title,
    body: body.body ?? '',
    head: branch,
    base: config.defaultBranch,
    draft,
  });

  saveBrainSyncConfig(ctx, {
    ...config,
    lastPrNumber: pr.number,
    lastPrUrl: pr.htmlUrl,
  });

  const status = await getBrainSyncStatus(ctx, { homeDir, fetchRemote: false });
  return { number: pr.number, htmlUrl: pr.htmlUrl, status };
}
