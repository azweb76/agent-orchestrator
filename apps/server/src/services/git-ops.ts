import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';

const execFileAsync = promisify(execFile);

export class GitService {
  async clone(url: string, targetPath: string): Promise<string> {
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await execFileAsync('git', ['clone', url, targetPath], { maxBuffer: 10 * 1024 * 1024 });
    return targetPath;
  }

  async getDefaultBranch(repoPath: string): Promise<string> {
    const { stdout } = await execFileAsync('git', ['-C', repoPath, 'symbolic-ref', 'refs/remotes/origin/HEAD']);
    return stdout.trim().replace('refs/remotes/origin/', '');
  }

  async fetch(repoPath: string, remote = 'origin'): Promise<void> {
    await execFileAsync('git', ['-C', repoPath, 'fetch', remote, '--prune'], {
      maxBuffer: 10 * 1024 * 1024,
    });
  }

  async addWorktree(
    mainRepoPath: string,
    worktreePath: string,
    branch: string,
    options: { createBranch?: boolean; startRef?: string; overwrite?: boolean } = {},
  ): Promise<void> {
    await fs.mkdir(path.dirname(worktreePath), { recursive: true });
    const args = ['-C', mainRepoPath, 'worktree', 'add'];
    if (options.createBranch) {
      const startRef = options.startRef ?? branch;
      const branchFlag = options.overwrite ? '-B' : '-b';
      args.push(branchFlag, branch, worktreePath, startRef);
    } else {
      args.push(worktreePath, branch);
    }
    await execFileAsync('git', args, { maxBuffer: 10 * 1024 * 1024 });
  }

  /** True when `refs/heads/<branch>` exists in the main repo. */
  async localBranchExists(mainRepoPath: string, branch: string): Promise<boolean> {
    try {
      await execFileAsync(
        'git',
        ['-C', mainRepoPath, 'show-ref', '--verify', '--quiet', `refs/heads/${branch}`],
      );
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Fetch a GitHub PR head into `refs/pull/<n>/head`, then create/update
   * `localBranch` to match — without fetching directly into a checked-out branch
   * (which Git refuses when the branch is used by a worktree).
   *
   * Dest is GitHub's PR namespace, not `refs/remotes/pull/<n>/head`. With
   * `fetch.prune` / `remote.origin.prune` (common global config), Git treats a
   * `refs/remotes/...` dest as a stale tracking ref and deletes it after the
   * fetch, so `git branch -f` fails with "not a valid object name".
   */
  async fetchPullRequest(mainRepoPath: string, prNumber: number, localBranch: string): Promise<void> {
    const pullRef = `refs/pull/${prNumber}/head`;
    await execFileAsync(
      'git',
      [
        '-C',
        mainRepoPath,
        'fetch',
        '--no-prune',
        'origin',
        `+refs/pull/${prNumber}/head:${pullRef}`,
      ],
      { maxBuffer: 10 * 1024 * 1024 },
    );

    const checkedOutAt = await this.getWorktreePathForBranch(mainRepoPath, localBranch);
    if (checkedOutAt) {
      // Cannot move refs/heads/<branch> while it is checked out; caller should reuse
      // the existing worktree. Leave the branch tip as-is.
      return;
    }

    await execFileAsync('git', ['-C', mainRepoPath, 'branch', '-f', localBranch, pullRef], {
      maxBuffer: 10 * 1024 * 1024,
    });
  }

  /** Return the worktree path that has `branch` checked out, if any. */
  async getWorktreePathForBranch(mainRepoPath: string, branch: string): Promise<string | null> {
    const { stdout } = await execFileAsync('git', ['-C', mainRepoPath, 'worktree', 'list', '--porcelain'], {
      maxBuffer: 10 * 1024 * 1024,
    });
    const want = `refs/heads/${branch}`;
    let currentPath: string | null = null;
    for (const line of stdout.split('\n')) {
      if (line.startsWith('worktree ')) {
        currentPath = line.slice('worktree '.length);
      } else if (line.startsWith('branch ') && line.slice('branch '.length) === want) {
        return currentPath;
      } else if (line === '') {
        currentPath = null;
      }
    }
    return null;
  }

  async removeWorktree(mainRepoPath: string, worktreePath: string): Promise<void> {
    try {
      await execFileAsync('git', ['-C', mainRepoPath, 'worktree', 'remove', '--force', worktreePath]);
    } catch {
      await fs.rm(worktreePath, { recursive: true, force: true });
    }
  }

  /**
   * Diff the worktree against `baseRef` (default HEAD = pending uncommitted changes).
   * When comparing to HEAD, untracked files are included so new agent-created files appear.
   */
  async getDiff(worktreePath: string, baseRef?: string): Promise<{ stat: string; patch: string }> {
    const base = baseRef ?? 'HEAD';
    const [statResult, patchResult] = await Promise.all([
      execFileAsync('git', ['-C', worktreePath, 'diff', '--stat', base], { maxBuffer: 10 * 1024 * 1024 }),
      execFileAsync('git', ['-C', worktreePath, 'diff', base], { maxBuffer: 20 * 1024 * 1024 }),
    ]);

    let stat = statResult.stdout.trim();
    let patch = patchResult.stdout;

    if (base === 'HEAD') {
      const untracked = await this.getUntrackedDiff(worktreePath);
      if (untracked.patch) {
        patch = patch ? `${patch}${patch.endsWith('\n') ? '' : '\n'}${untracked.patch}` : untracked.patch;
        const untrackedStat = untracked.paths
          .map((filePath) => ` ${filePath} | Untracked`)
          .join('\n');
        stat = [stat, untrackedStat, untracked.paths.length ? ` ${untracked.paths.length} untracked` : '']
          .filter(Boolean)
          .join('\n');
      }
    }

    return { stat, patch };
  }

  /** Build a unified diff for untracked (and not ignored) files. */
  private async getUntrackedDiff(
    worktreePath: string,
  ): Promise<{ patch: string; paths: string[] }> {
    const { stdout } = await execFileAsync(
      'git',
      ['-C', worktreePath, 'ls-files', '--others', '--exclude-standard', '-z'],
      { maxBuffer: 10 * 1024 * 1024 },
    );
    const paths = stdout.split('\0').map((p) => p.trim()).filter(Boolean);
    if (paths.length === 0) return { patch: '', paths: [] };

    const chunks: string[] = [];
    for (const filePath of paths) {
      try {
        const { stdout: fileDiff } = await execFileAsync(
          'git',
          ['-C', worktreePath, 'diff', '--no-index', '--', '/dev/null', filePath],
          { maxBuffer: 10 * 1024 * 1024 },
        );
        if (fileDiff) chunks.push(fileDiff);
      } catch (err) {
        // git diff --no-index exits 1 when files differ; stdout still has the patch.
        const execErr = err as { stdout?: string; code?: number };
        if (typeof execErr.stdout === 'string' && execErr.stdout) {
          chunks.push(execErr.stdout);
        }
      }
    }
    return { patch: chunks.join(''), paths };
  }

  async getCurrentBranch(worktreePath: string): Promise<string> {
    const { stdout } = await execFileAsync('git', ['-C', worktreePath, 'branch', '--show-current']);
    return stdout.trim();
  }

  async hasChanges(worktreePath: string): Promise<boolean> {
    const { stdout } = await execFileAsync('git', ['-C', worktreePath, 'status', '--porcelain']);
    return stdout.trim().length > 0;
  }

  async pushBranch(worktreePath: string, branch: string): Promise<void> {
    await execFileAsync('git', ['-C', worktreePath, 'push', '-u', 'origin', branch], {
      maxBuffer: 10 * 1024 * 1024,
    });
  }

  async commitAll(worktreePath: string, message: string): Promise<void> {
    await execFileAsync('git', ['-C', worktreePath, 'add', '-A']);
    await execFileAsync('git', ['-C', worktreePath, 'commit', '-m', message]);
  }
}
