const TOOL_LABELS: Record<string, string> = {
  Read: 'Reading',
  Write: 'Writing',
  Edit: 'Editing',
  Bash: 'Running command',
  Glob: 'Finding files',
  Grep: 'Searching',
  WebFetch: 'Fetching',
  WebSearch: 'Searching the web',
  Task: 'Delegating',
  Agent: 'Delegating',
  NotebookEdit: 'Editing notebook',
  Skill: 'Using skill',
  AskUserQuestion: 'Asking a question',
  ExitPlanMode: 'Proposing a plan',
  TodoWrite: 'Updating tasks',
  BashOutput: 'Checking command output',
  KillShell: 'Stopping a command',
};

const SUBAGENT_TYPE_LABELS: Record<string, string> = {
  Explore: 'Explore',
  Plan: 'Plan',
  Bash: 'Bash',
  'general-purpose': 'General',
};

/** Present-tense label for the active Claude tool. */
export function toolActionLabel(name: string): string {
  if (TOOL_LABELS[name]) return TOOL_LABELS[name];
  if (name.startsWith('mcp__')) {
    const parts = name.split('__').filter(Boolean);
    const last = parts[parts.length - 1]?.replace(/_/g, ' ');
    return last ? last.charAt(0).toUpperCase() + last.slice(1) : name;
  }
  return name;
}

export function subagentTypeLabel(type: string | undefined): string | undefined {
  if (!type) return undefined;
  if (SUBAGENT_TYPE_LABELS[type]) return SUBAGENT_TYPE_LABELS[type];
  return type.replace(/-/g, ' ');
}

/** Compact duration for subagent progress (e.g. 14s, 2m 52s). */
export function formatDurationMs(ms: number | undefined): string | undefined {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) return undefined;
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${Math.max(sec, 0)}s`;
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  return rem ? `${min}m ${rem}s` : `${min}m`;
}

export function toolPreview(input: Record<string, unknown> | undefined): string | undefined {
  if (!input) return undefined;
  if (typeof input.command === 'string') return input.command;
  if (typeof input.file_path === 'string') return input.file_path;
  if (typeof input.path === 'string') return input.path;
  if (typeof input.pattern === 'string') return input.pattern;
  if (typeof input.query === 'string') return input.query;
  if (typeof input.url === 'string') return input.url;
  if (typeof input.description === 'string') return input.description;
  return undefined;
}
