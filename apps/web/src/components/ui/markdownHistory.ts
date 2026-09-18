export interface MarkdownHistoryEntry {
  value: string;
  selectionStart: number;
  selectionEnd: number;
}

export interface MarkdownHistoryState {
  past: MarkdownHistoryEntry[];
  present: MarkdownHistoryEntry;
  future: MarkdownHistoryEntry[];
}

export function createHistory(entry: MarkdownHistoryEntry): MarkdownHistoryState {
  return { past: [], present: entry, future: [] };
}

/**
 * Records an edit as the new present state. When `coalesce` is true, the edit merges into the
 * current present entry instead of pushing a new undo step, so a burst of continuous typing
 * becomes a single undo step rather than one per keystroke.
 */
export function recordEdit(
  state: MarkdownHistoryState,
  entry: MarkdownHistoryEntry,
  coalesce: boolean,
): MarkdownHistoryState {
  if (entry.value === state.present.value) {
    return { ...state, present: entry };
  }
  if (coalesce) {
    return { ...state, present: entry, future: [] };
  }
  return { past: [...state.past, state.present], present: entry, future: [] };
}

export function undo(state: MarkdownHistoryState): MarkdownHistoryState | null {
  if (state.past.length === 0) return null;
  const previous = state.past[state.past.length - 1];
  return { past: state.past.slice(0, -1), present: previous, future: [state.present, ...state.future] };
}

export function redo(state: MarkdownHistoryState): MarkdownHistoryState | null {
  if (state.future.length === 0) return null;
  const next = state.future[0];
  return { past: [...state.past, state.present], present: next, future: state.future.slice(1) };
}

const CONTINUOUS_EDIT_MAX_GAP_MS = 600;

/** True when an edit looks like the continuation of the same typing burst (small, recent). */
export function isContinuousEdit(prevValue: string, nextValue: string, elapsedMs: number): boolean {
  if (elapsedMs > CONTINUOUS_EDIT_MAX_GAP_MS) return false;
  return Math.abs(nextValue.length - prevValue.length) <= 1;
}
