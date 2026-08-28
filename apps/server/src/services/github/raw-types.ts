export interface RawPullRequest {
  number: number;
  title: string;
  state: string;
  draft: boolean;
  html_url: string;
  head: { ref: string };
  base: { ref: string };
  user?: { login: string } | null;
  updated_at?: string;
}

export interface GitHubSearchIssue {
  number: number;
  title: string;
  state: string;
  draft?: boolean;
  html_url: string;
  updated_at: string;
  user: { login: string };
  repository_url: string;
  pull_request?: { url: string };
}

export interface SearchedPullRequest {
  number: number;
  title: string;
  state: string;
  htmlUrl: string;
  draft: boolean;
  owner: string;
  repo: string;
  authorLogin: string;
  updatedAt: string;
}

export interface SearchedIssue {
  number: number;
  title: string;
  state: string;
  htmlUrl: string;
  owner: string;
  repo: string;
  authorLogin: string;
  updatedAt: string;
}

export interface RawUser {
  login: string;
  avatar_url?: string | null;
  html_url?: string | null;
}

export interface RawPullRequestDetail {
  node_id?: string;
  number: number;
  title: string;
  body: string | null;
  state: string;
  draft: boolean;
  merged: boolean;
  mergeable: boolean | null;
  mergeable_state: string;
  rebaseable: boolean | null;
  html_url: string;
  user: RawUser | null;
  head: { ref: string; sha: string };
  base: { ref: string; sha: string };
  additions?: number;
  deletions?: number;
  changed_files?: number;
  commits?: number;
  comments?: number;
  review_comments?: number;
  labels?: Array<{ name: string; color?: string | null }>;
  created_at: string;
  updated_at: string;
  merged_at: string | null;
  closed_at: string | null;
  merge_commit_sha: string | null;
}

export interface RawRepoSettings {
  allow_merge_commit?: boolean;
  allow_squash_merge?: boolean;
  allow_rebase_merge?: boolean;
  delete_branch_on_merge?: boolean;
  archived?: boolean;
}

export interface RawCheckRun {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  output?: { title?: string | null; summary?: string | null };
  details_url?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
}

export interface RawCommitStatus {
  id: number;
  context: string;
  state: string;
  description: string | null;
  target_url: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface RawReview {
  id: number;
  user: RawUser | null;
  state: string;
  body: string | null;
  html_url?: string | null;
  submitted_at?: string | null;
}

export interface RawFile {
  filename: string;
  previous_filename?: string | null;
  status: string;
  additions: number;
  deletions: number;
  changes: number;
  patch?: string | null;
  blob_url?: string | null;
}

export interface RawCommit {
  sha: string;
  html_url?: string | null;
  author: RawUser | null;
  commit: { message: string; author?: { name?: string | null; date?: string | null } | null };
}

export interface RawComment {
  id: number;
  user: RawUser | null;
  body: string | null;
  html_url?: string | null;
  created_at: string;
}

export interface RawReviewComment {
  id: number;
  user: RawUser | null;
  body: string | null;
  path?: string | null;
  line?: number | null;
  original_line?: number | null;
  html_url?: string | null;
  created_at: string;
  in_reply_to_id?: number | null;
  pull_request_review_id?: number | null;
}
