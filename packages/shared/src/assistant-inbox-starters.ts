/** Inbox → Assistant prompts (GitHub issues, Jira, PR create/templates). */

export type InboxGithubIssueRef = {
  owner: string;
  repo: string;
  number: number;
};

export type InboxJiraIssueRef = {
  key: string;
  workspaceId?: string | null;
};

export type InboxPrRef = {
  owner: string;
  repo: string;
  number: number;
  agentId?: string | null;
};

export type InboxAssistantStarter = {
  id: string;
  label: string;
  prompt: string;
};

function prRef(pr: InboxPrRef): string {
  return `${pr.owner}/${pr.repo}#${pr.number}`;
}

export function buildGithubIssueStartPrompt(issue: InboxGithubIssueRef): InboxAssistantStarter {
  const ref = `${issue.owner}/${issue.repo}#${issue.number}`;
  return {
    id: `github-issue:${ref}`,
    label: `Start ${ref}`,
    prompt: `Create an agent from GitHub issue ${ref} using create_agent_from_github_issue with confirm=true. Confirm with me before writing.`,
  };
}

export function buildJiraIssueStartPrompt(issue: InboxJiraIssueRef): InboxAssistantStarter {
  const workspaceClause = issue.workspaceId
    ? ` Pass workspaceId=${issue.workspaceId}.`
    : ' If no workspace is obvious, ask me which workspace to use.';
  return {
    id: `jira-issue:${issue.key}`,
    label: `Start ${issue.key}`,
    prompt: `Create an agent from Jira issue ${issue.key} using create_agent_from_jira_issue with confirm=true.${workspaceClause} Confirm with me before writing.`,
  };
}

export function buildPrCreateAgentPrompt(pr: InboxPrRef): InboxAssistantStarter {
  const ref = prRef(pr);
  if (pr.agentId) {
    return {
      id: `pr-open:${ref}`,
      label: `Open ${ref}`,
      prompt: `Summarize agent ${pr.agentId} linked to ${ref} and whether it needs Fix CI, Address review, or anything else.`,
    };
  }
  return {
    id: `pr-create:${ref}`,
    label: `Start agent for ${ref}`,
    prompt: `Create an agent from pull request ${ref} using create_agent_from_pull_request with confirm=true. Confirm with me before writing.`,
  };
}

export function buildPrTemplatePrompt(
  pr: InboxPrRef,
  template: 'fix-ci' | 'address-review' | 'resolve-conflicts',
): InboxAssistantStarter {
  const ref = prRef(pr);
  const label =
    template === 'fix-ci'
      ? `Fix CI on ${ref}`
      : template === 'address-review'
        ? `Address review on ${ref}`
        : `Resolve conflicts on ${ref}`;
  return {
    id: `pr-template:${template}:${ref}`,
    label,
    prompt: `Start a ${template} session for ${ref} using start_agent_session (reuse agent ${pr.agentId ?? 'if one exists'}). Confirm with me before writing.`,
  };
}
