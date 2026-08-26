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

/** Present-tense label for the active Claude tool. */
export function toolActionLabel(name: string, detail?: string): string {
  if ((name === 'Task' || name === 'Agent') && detail && /^explore\b/i.test(detail)) {
    return 'Exploring';
  }
  if (TOOL_LABELS[name]) return TOOL_LABELS[name];
  if (name.startsWith('mcp__')) {
    const parts = name.split('__').filter(Boolean);
    const last = parts[parts.length - 1]?.replace(/_/g, ' ');
    return last ? last.charAt(0).toUpperCase() + last.slice(1) : name;
  }
  return name;
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
  if (typeof input.subagent_type === 'string') return input.subagent_type;
  return undefined;
}
