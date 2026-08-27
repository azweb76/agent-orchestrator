type MergeableChatMessage = {
  id: string;
  role: string;
  content: string;
  metadata: { streaming?: boolean; timeline?: unknown[] };
};

function streamWeight(message: MergeableChatMessage): number {
  return (message.content?.length ?? 0) + (message.metadata?.timeline?.length ?? 0);
}

/**
 * Merge a messages refetch into the live transcript.
 *
 * A lagged GET can otherwise resurrect `streaming: true` after the turn already
 * finished (or drop tokens the SSE path applied). Server completion always wins;
 * a completed local turn is never replaced by a still-streaming snapshot; while
 * both sides are streaming, keep the longer live copy. Local-only messages
 * (optimistic SSE inserts the refetch has not seen yet) are appended.
 */
export function mergeChatMessages<T extends MergeableChatMessage>(
  local: T[] | undefined,
  remote: T[],
): T[] {
  if (!local?.length) return remote;

  const localById = new Map(local.map((item) => [item.id, item]));
  const remoteIds = new Set(remote.map((item) => item.id));

  const merged = remote.map((remoteMsg) => {
    const prev = localById.get(remoteMsg.id);
    if (!prev) return remoteMsg;
    if (!remoteMsg.metadata?.streaming) return remoteMsg;
    if (prev.role === 'assistant' && !prev.metadata?.streaming) return prev;
    if (
      prev.role === 'assistant' &&
      prev.metadata?.streaming &&
      streamWeight(prev) > streamWeight(remoteMsg)
    ) {
      return prev;
    }
    return remoteMsg;
  });

  const extras = local.filter((item) => !remoteIds.has(item.id));
  if (extras.length === 0) return merged;
  return [...merged, ...extras];
}
