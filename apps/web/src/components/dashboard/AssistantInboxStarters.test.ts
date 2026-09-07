import { describe, expect, it } from 'vitest';
import {
  buildGithubIssueStartPrompt,
  buildJiraIssueStartPrompt,
  buildPrCreateAgentPrompt,
  buildPrTemplatePrompt,
} from '@agent-orchestrator/shared';

describe('assistant inbox starters', () => {
  it('builds GitHub issue prompts with create_agent_from_github_issue', () => {
    const starter = buildGithubIssueStartPrompt({
      owner: 'acme',
      repo: 'demo',
      number: 12,
    });
    expect(starter.label).toBe('Start acme/demo#12');
    expect(starter.prompt).toContain('create_agent_from_github_issue');
    expect(starter.prompt).toContain('confirm=true');
  });

  it('builds Jira prompts with optional workspaceId', () => {
    const withWs = buildJiraIssueStartPrompt({ key: 'PROJ-9', workspaceId: 'ws-1' });
    expect(withWs.prompt).toContain('create_agent_from_jira_issue');
    expect(withWs.prompt).toContain('workspaceId=ws-1');

    const withoutWs = buildJiraIssueStartPrompt({ key: 'PROJ-9' });
    expect(withoutWs.prompt).toContain('ask me which workspace');
  });

  it('builds PR create and template prompts', () => {
    const create = buildPrCreateAgentPrompt({
      owner: 'acme',
      repo: 'demo',
      number: 44,
    });
    expect(create.prompt).toContain('create_agent_from_pull_request');

    const fixCi = buildPrTemplatePrompt(
      { owner: 'acme', repo: 'demo', number: 44, agentId: 'ag-1' },
      'fix-ci',
    );
    expect(fixCi.prompt).toContain('start_agent_session');
    expect(fixCi.prompt).toContain('fix-ci');
  });
});
