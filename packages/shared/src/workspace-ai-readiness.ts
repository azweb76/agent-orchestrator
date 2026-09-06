/** Workspace default-branch sync vs origin. */
export interface WorkspaceSyncStatus {
  defaultBranch: string;
  /** Short SHA of local `refs/heads/<defaultBranch>`, if present. */
  localSha: string | null;
  /** Short SHA of `origin/<defaultBranch>` after fetch. */
  remoteSha: string | null;
  aheadBy: number;
  behindBy: number;
  /** True when local default branch exists and is not behind origin. */
  upToDate: boolean;
  /** ISO time when status was computed (after fetch). */
  checkedAt: string;
  /** True when the default branch tip is checked out in a worktree. */
  defaultBranchCheckedOut: boolean;
  checkedOutWorktreePath: string | null;
}

export type WorkspaceAiCheckId =
  | 'claude_md_present'
  | 'agents_md_present'
  | 'claude_imports_agents'
  | 'claude_md_concise'
  | 'agents_md_concise'
  | 'has_commands'
  | 'has_verification'
  | 'has_boundaries'
  | 'has_skills'
  | 'not_second_readme';

export type WorkspaceAiCheckStatus = 'pass' | 'warn' | 'fail' | 'info';

export interface WorkspaceAiCheck {
  id: WorkspaceAiCheckId;
  title: string;
  status: WorkspaceAiCheckStatus;
  detail: string;
  /** Suggested remediation for an implement agent. */
  recommendation: string;
}

export interface WorkspaceAiFileInfo {
  path: string;
  exists: boolean;
  lineCount: number | null;
  charCount: number | null;
}

export interface WorkspaceAiLlmAdvice {
  summary: string;
  priorities: string[];
  /** Concrete implementable steps for an agent. */
  implementationPlan: string;
}

export interface WorkspaceAiReadiness {
  defaultBranch: string;
  /** Ref analyzed (usually `origin/<defaultBranch>`). */
  analyzedRef: string;
  analyzedSha: string | null;
  score: number;
  maxScore: number;
  checks: WorkspaceAiCheck[];
  files: WorkspaceAiFileInfo[];
  skillPaths: string[];
  llm: WorkspaceAiLlmAdvice | null;
  llmError: string | null;
  checkedAt: string;
}

export interface CreateAiReadinessAgentRequest {
  /** Optional subset of check ids to focus the agent on. Defaults to non-pass checks. */
  checkIds?: WorkspaceAiCheckId[];
  /** Agent task slug, or `"auto"`. Defaults to `"auto"`. */
  task?: string;
  model?: string;
  effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max';
  overwrite?: boolean;
  branch?: string;
  name?: string;
}
