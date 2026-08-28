/** Max diff lines rendered per file preview (keeps large patches responsive). */
export const MAX_DIFF_PREVIEW_LINES = 400;

export function truncatePatch(patch: string, maxLines = MAX_DIFF_PREVIEW_LINES): {
  patch: string;
  truncated: boolean;
  totalLines: number;
} {
  const lines = patch.split('\n');
  if (lines.length <= maxLines) {
    return { patch, truncated: false, totalLines: lines.length };
  }
  const kept = lines.slice(0, maxLines);
  kept.push(`… ${lines.length - maxLines} more lines not shown`);
  return { patch: kept.join('\n'), truncated: true, totalLines: lines.length };
}
