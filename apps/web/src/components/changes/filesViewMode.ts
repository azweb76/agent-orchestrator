import type { AgentDiffScope } from '@agent-orchestrator/shared';

/** Files tab modes: the three server diff scopes plus whole-worktree browsing. */
export type FilesViewMode = AgentDiffScope | 'all';

export const isDiffScope = (mode: FilesViewMode): mode is AgentDiffScope => mode !== 'all';
