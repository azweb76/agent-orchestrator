/** Minimal workspace fields needed to match a Jira project. */
export interface JiraWorkspaceCandidate {
  id: string;
  name: string;
  githubOwner: string;
  githubRepo: string;
}

/**
 * Resolve a workspace for a Jira project key.
 * Preference: remembered mapping → exact repo/name → loose contains match.
 */
export function matchJiraWorkspace(
  projectKey: string,
  workspaces: readonly JiraWorkspaceCandidate[],
  remembered: Record<string, string> = {},
): string | null {
  const key = projectKey.trim().toUpperCase();
  if (!key) return null;

  const rememberedId = remembered[key] ?? remembered[projectKey.trim()];
  if (rememberedId && workspaces.some((ws) => ws.id === rememberedId)) {
    return rememberedId;
  }

  const exactRepo = workspaces.find((ws) => ws.githubRepo.toUpperCase() === key);
  if (exactRepo) return exactRepo.id;

  const exactName = workspaces.find((ws) => ws.name.trim().toUpperCase() === key);
  if (exactName) return exactName.id;

  if (key.length < 2) return null;

  const loose = workspaces.find((ws) => {
    const repo = ws.githubRepo.toUpperCase();
    const name = ws.name.trim().toUpperCase();
    return repo.includes(key) || key.includes(repo) || name.includes(key) || key.includes(name);
  });
  return loose?.id ?? null;
}

/** Normalize a project→workspace map (upper-case keys, drop empty). */
export function normalizeJiraWorkspaceMap(
  raw: Record<string, string> | null | undefined,
): Record<string, string> {
  if (!raw) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    const project = key.trim().toUpperCase();
    const workspaceId = value.trim();
    if (project && workspaceId) out[project] = workspaceId;
  }
  return out;
}
