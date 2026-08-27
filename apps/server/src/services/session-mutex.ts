import {
  isGitMutatingSessionTemplate,
  type ChatSession,
} from '@agent-orchestrator/shared';

export function isGitMutatingSession(session: Pick<ChatSession, 'template'>): boolean {
  return isGitMutatingSessionTemplate(session.template);
}

/** Another git-mutating session already has a live Claude run on this agent. */
export function findRunningMutatingPeer(
  sessions: ChatSession[],
  sessionId: string,
): ChatSession | undefined {
  return sessions.find(
    (item) => item.id !== sessionId && item.status === 'running' && isGitMutatingSession(item),
  );
}

export function findRunningMutatingSession(sessions: ChatSession[]): ChatSession | undefined {
  return sessions.find((item) => item.status === 'running' && isGitMutatingSession(item));
}

/** True when this mutating session must wait for a peer run to finish. */
export function shouldQueueMutatingStart(
  sessions: ChatSession[],
  session: ChatSession,
): boolean {
  return isGitMutatingSession(session) && Boolean(findRunningMutatingPeer(sessions, session.id));
}

/**
 * Oldest mutating session that is waiting (status queued, or idle with a
 * persisted follow-up) so the worktree lock can be handed off FIFO.
 */
export function nextWaitingMutatingSession(
  sessions: ChatSession[],
  hasQueued: (sessionId: string) => boolean,
): ChatSession | undefined {
  const waiting = sessions.filter((item) => {
    if (!isGitMutatingSession(item) || item.status === 'running') return false;
    return item.status === 'queued' || hasQueued(item.id);
  });
  waiting.sort((a, b) => {
    const byUpdated = a.updatedAt.localeCompare(b.updatedAt);
    if (byUpdated !== 0) return byUpdated;
    return a.createdAt.localeCompare(b.createdAt);
  });
  return waiting[0];
}
