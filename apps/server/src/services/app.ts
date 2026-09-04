export type { AppContext } from './app-context.js';
export { nowIso, notify, makeEvent } from './app-context.js';

export {
  createAgentForWorktree,
  createSessionForAgent,
  requireAgent,
  requireSession,
  syncAgentFromSessions,
  clearSessionRunFields,
  maybeAutoNameChatSession,
  persistSessionRuntime,
  sessionTitleSource,
} from './agent-core.js';

export {
  listWorkspaces,
  listSidebarTree,
  getUsageSummary,
  createWorkspace,
  getWorkspace,
  deleteWorkspace,
  listWorkspaceMentionFiles,
} from './workspaces.js';

export {
  overlayLivePullRequest,
  listWorktrees,
  createWorktreeFromBranch,
  createWorktreeFromPr,
  deleteWorktree,
  createWorktreeFromGoal,
  createWorktreeFromIdea,
  createWorktreeFromIssue,
} from './worktrees.js';

export {
  getAgentDetail,
  stopAllSessions,
  stopAgentSession,
  stopAgent,
  archiveAgent,
  unarchiveAgent,
  deleteAgent,
  pruneArchivedAgents,
  getAgentAttachment,
  getAgentDiff,
  listAgentSlashCommands,
  listAgentMentionFiles,
  createAgentPullRequest,
  commitAgentChanges,
} from './agents-lifecycle.js';

export {
  createAgentSession,
  updateAgentSession,
  deleteAgentSession,
  gradeAgentSession,
  listAgentInstructionFiles,
  generateAgentInstructionDraft,
  applyAgentInstructionFile,
  activateAgentSession,
  getAgentMessages,
  getAgentSessionContext,
  clearAgentChat,
  rewindAgentChat,
} from './sessions.js';

export {
  listPendingPermissions,
  answerAskUserQuestion,
  allowPermissionRequest,
  denyPermissionRequest,
  buildApprovedPlan,
} from './permissions-plan.js';

export {
  saveChatImages,
  stopClaudeRun,
  recoverRunningAgents,
  finalizeSessionRun,
  markStreamingAssistantStopped,
  persistAssistantProgress,
  cleanupMessageAttachments,
} from './chat-run-lifecycle.js';

export { streamAgentChat } from './chat-stream.js';
export { followAgentSession } from './chat-follow.js';

export {
  getPullRequestInbox,
  getPullRequestDetail,
  getPullRequestChecks,
  getPullRequestReviews,
  getPullRequestFiles,
  getPullRequestCommits,
  getPullRequestComments,
  submitPullRequestReview,
  createPullRequestComment,
  mergePullRequest,
  setPullRequestState,
  markPullRequestReady,
  updatePullRequestBranch,
  createAgentFromPullRequest,
} from './pull-requests.js';

export {
  getIssueInbox,
  createAgentFromIssue,
} from './github-issues.js';

export {
  getJiraIssueInbox,
  createAgentFromJiraIssue,
  createWorktreeFromJiraIssue,
} from './jira-issues.js';

export {
  listGitHubBranches,
  listGitHubPullRequests,
  searchGitHubRepositories,
  getSystemStatus,
  getSetupInfo,
  configureGithubToken,
  configureClaudeBin,
} from './system-github.js';

export { listClaudeProcesses } from './claude-process-list.js';

export {
  drainSessionQueue,
  enqueueChatMessage,
  enqueueSpendCapBlocked,
  listQueuedMessages,
  removeQueuedMessage,
} from './chat-queue.js';

export { getAppSettings, updateAppSettings } from './app-settings.js';
export type { UpdateAppSettingsRequest } from './app-settings.js';
