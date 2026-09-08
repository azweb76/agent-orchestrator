/** GitHub library that mirrors Brain skills, tasks, and follow-ups. */
export interface BrainSyncConfig {
  repoUrl: string;
  githubOwner: string;
  githubRepo: string;
  defaultBranch: string;
  lastPrNumber: number | null;
  lastPrUrl: string | null;
}

export interface BrainSyncChangedFile {
  path: string;
}

export interface BrainSyncStatus {
  configured: boolean;
  repoUrl: string | null;
  githubOwner: string | null;
  githubRepo: string | null;
  defaultBranch: string | null;
  isGitHub: boolean;
  dirty: boolean;
  aheadBy: number;
  behindBy: number;
  changedFiles: string[];
  localSha: string | null;
  remoteSha: string | null;
  lastPrNumber: number | null;
  lastPrUrl: string | null;
  checkedAt: string | null;
}

export interface ConnectBrainRepoRequest {
  /** `owner/repo`, GitHub HTTPS URL, or any git remote (tests). */
  repoUrl: string;
}

export interface CreateBrainPullRequestRequest {
  title: string;
  body?: string;
  draft?: boolean;
}

export const EMPTY_BRAIN_SYNC_STATUS: BrainSyncStatus = {
  configured: false,
  repoUrl: null,
  githubOwner: null,
  githubRepo: null,
  defaultBranch: null,
  isGitHub: false,
  dirty: false,
  aheadBy: 0,
  behindBy: 0,
  changedFiles: [],
  localSha: null,
  remoteSha: null,
  lastPrNumber: null,
  lastPrUrl: null,
  checkedAt: null,
};
