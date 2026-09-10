/**
 * Secrets belonging to the orchestrator that a spawned child has no need for.
 *
 * Agent runs get Bash auto-approved in auto/dontAsk/bypassPermissions modes, and
 * every child's stdout and stderr is captured verbatim into data/runs/*.log and
 * streamed to the UI. Anything left in the environment is therefore readable by
 * the model and persisted to disk.
 *
 * GITHUB_TOKEN is included deliberately. It is the orchestrator's own repo-scoped
 * PAT, and the app performs its GitHub work itself through GitHubService. An
 * agent that genuinely needs `gh` still authenticates through the user's own
 * `gh auth login` credentials under HOME, which is passed through untouched.
 */
const STRIPPED_ENV_KEYS = [
  'AUTH_TOKEN',
  'ASSISTANT_MCP_TOKEN',
  'GITHUB_TOKEN',
  'GITHUB_LOGIN',
  'JIRA_API_TOKEN',
  'JIRA_BASE_URL',
  'JIRA_EMAIL',
] as const;

/**
 * Environment for a spawned child: the current environment minus the
 * orchestrator's own secrets.
 *
 * Deliberately a denylist rather than an allowlist. Claude Code reads a wide and
 * changing set of variables — ANTHROPIC_*, CLAUDE_*, proxy settings, AWS_* when
 * routed through Bedrock, NODE_EXTRA_CA_CERTS behind a corporate CA — and an
 * allowlist would silently break those setups. CLAUDE_CONFIG_DIR in particular
 * must survive, since the server reads session files from wherever the child
 * writes them.
 */
export function childEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, ...extra };
  for (const key of STRIPPED_ENV_KEYS) delete env[key];
  return env;
}

/** Exposed for tests. */
export function strippedEnvKeys(): readonly string[] {
  return STRIPPED_ENV_KEYS;
}
