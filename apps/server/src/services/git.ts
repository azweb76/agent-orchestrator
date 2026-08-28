export { GitService } from './git-ops.js';

export type {
  ClaudeStreamEvent,
  ClaudePermissionMode,
  ClaudePermissionRequest,
  ClaudeEventMeta,
  ClaudeRunOptions,
  ClaudeRunHandle,
  ClaudeRunResult,
} from './claude-types.js';

export {
  DEFAULT_ALLOWED_TOOLS,
  INTERACTIVE_TOOLS,
  buildClaudeArgs,
  buildPromptWithImages,
  buildPromptWithMentionContext,
  buildStreamUserMessage,
} from './claude-args.js';

export {
  isPidAlive,
  killProcessTree,
  stdinPathsForLog,
} from './claude-process.js';

export { readClaudeLogSnapshot, followClaudeLog } from './claude-log.js';

export { ClaudeService } from './claude-service.js';

export { enrichPermissionInput, claudePlansDirectory } from './claude-permission-input.js';

export { parseGitHubUrl, slugify } from './repo-slug.js';
