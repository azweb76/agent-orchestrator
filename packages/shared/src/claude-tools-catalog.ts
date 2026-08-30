/**
 * Claude Code built-in tool catalog for `--allowedTools` / permission rules.
 * Names match https://code.claude.com/docs/en/tools-reference
 */

export type ClaudeToolCategory =
  | 'files'
  | 'search'
  | 'shell'
  | 'web'
  | 'agents'
  | 'tasks'
  | 'session'
  | 'other';

export interface ClaudeCodeTool {
  id: string;
  label: string;
  description: string;
  category: ClaudeToolCategory;
  /** Example specifier for Tool(pattern) rules. */
  patternHint?: string;
  /**
   * Must never be auto-approved via `--allowedTools` — always hit the UI /
   * stdio permission prompt.
   */
  interactive?: boolean;
}

export const CLAUDE_TOOL_CATEGORY_LABELS: Record<ClaudeToolCategory, string> = {
  files: 'Files',
  search: 'Search',
  shell: 'Shell',
  web: 'Web',
  agents: 'Agents & skills',
  tasks: 'Task tracking',
  session: 'Session',
  other: 'Other',
};

/** Interactive tools that sanitize strips from allowed-tools overrides. */
export const INTERACTIVE_CLAUDE_TOOLS = ['AskUserQuestion', 'ExitPlanMode'] as const;

type ToolRow = {
  id: string;
  category: ClaudeToolCategory;
  description: string;
  patternHint?: string;
  interactive?: boolean;
};

const TOOL_ROWS: readonly ToolRow[] = [
  { id: 'Read', category: 'files', description: 'Read file contents', patternHint: 'Read(./.env)' },
  { id: 'Write', category: 'files', description: 'Create or overwrite files' },
  { id: 'Edit', category: 'files', description: 'Targeted file edits', patternHint: 'Edit(/src/**)' },
  { id: 'NotebookEdit', category: 'files', description: 'Edit Jupyter notebook cells' },
  { id: 'Glob', category: 'search', description: 'Find files by pattern', patternHint: 'Glob(**/*.ts)' },
  { id: 'Grep', category: 'search', description: 'Search file contents' },
  { id: 'LSP', category: 'search', description: 'Code intelligence (definitions, references)' },
  { id: 'Bash', category: 'shell', description: 'Run shell commands', patternHint: 'Bash(git *)' },
  {
    id: 'PowerShell',
    category: 'shell',
    description: 'Run PowerShell commands',
    patternHint: 'PowerShell(Get-ChildItem *)',
  },
  {
    id: 'Monitor',
    category: 'shell',
    description: 'Watch background command or WebSocket output',
    patternHint: 'Monitor(tail *)',
  },
  {
    id: 'WebFetch',
    category: 'web',
    description: 'Fetch a URL',
    patternHint: 'WebFetch(domain:example.com)',
  },
  { id: 'WebSearch', category: 'web', description: 'Search the web' },
  {
    id: 'Agent',
    category: 'agents',
    description: 'Spawn a subagent (Explore, Plan, …)',
    patternHint: 'Agent(Explore)',
  },
  { id: 'Skill', category: 'agents', description: 'Run a skill', patternHint: 'Skill(deploy *)' },
  { id: 'Workflow', category: 'agents', description: 'Run a dynamic multi-agent workflow' },
  { id: 'ListAgents', category: 'agents', description: 'List agents available for messaging' },
  { id: 'SendMessage', category: 'agents', description: 'Message another agent or session' },
  { id: 'TaskCreate', category: 'tasks', description: 'Create a task list item' },
  { id: 'TaskGet', category: 'tasks', description: 'Get task details' },
  { id: 'TaskList', category: 'tasks', description: 'List tasks' },
  { id: 'TaskUpdate', category: 'tasks', description: 'Update or delete tasks' },
  { id: 'TaskOutput', category: 'tasks', description: 'Read background task output' },
  { id: 'TaskStop', category: 'tasks', description: 'Stop a background task' },
  { id: 'TodoWrite', category: 'tasks', description: 'Session checklist (legacy task list)' },
  {
    id: 'AskUserQuestion',
    category: 'session',
    description: 'Ask clarifying questions (always prompts)',
    interactive: true,
  },
  {
    id: 'ExitPlanMode',
    category: 'session',
    description: 'Propose a plan (always prompts)',
    interactive: true,
  },
  { id: 'EnterPlanMode', category: 'session', description: 'Switch into plan mode' },
  { id: 'EnterWorktree', category: 'session', description: 'Create or enter a git worktree' },
  { id: 'ExitWorktree', category: 'session', description: 'Leave a worktree session' },
  { id: 'EndConversation', category: 'session', description: 'End the session' },
  { id: 'CronCreate', category: 'other', description: 'Schedule a session prompt' },
  { id: 'CronDelete', category: 'other', description: 'Cancel a scheduled task' },
  { id: 'CronList', category: 'other', description: 'List scheduled tasks' },
  { id: 'ScheduleWakeup', category: 'other', description: 'Reschedule a /loop iteration' },
  { id: 'Artifact', category: 'other', description: 'Publish an HTML/Markdown artifact' },
  { id: 'PushNotification', category: 'other', description: 'Desktop / phone notification' },
  { id: 'SendFeedback', category: 'other', description: 'Draft a product feedback report' },
  { id: 'SendUserFile', category: 'other', description: 'Send a file to the user' },
  { id: 'ShareOnboardingGuide', category: 'other', description: 'Share ONBOARDING.md link' },
  { id: 'ReportFindings', category: 'other', description: 'Structured code-review findings' },
  { id: 'RemoteTrigger', category: 'other', description: 'Manage claude.ai Routines' },
  { id: 'ListMcpResourcesTool', category: 'other', description: 'List MCP resources' },
  { id: 'ReadMcpResourceTool', category: 'other', description: 'Read an MCP resource' },
  { id: 'ToolSearch', category: 'other', description: 'Search and load deferred tools' },
  { id: 'WaitForMcpServers', category: 'other', description: 'Wait for MCP servers to connect' },
];

/**
 * Built-in Claude Code tools. Order is the UI display order within each category.
 * MCP tools (`mcp__…`) are not listed; add them as custom patterns.
 */
export const CLAUDE_CODE_TOOLS: readonly ClaudeCodeTool[] = TOOL_ROWS.map((row) => ({
  ...row,
  label: row.id,
}));
