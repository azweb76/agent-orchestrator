interface RawRepo {
  owner: { login: string };
  name: string;
  full_name: string;
  html_url: string;
  description: string | null;
  private: boolean;
}

export function rawRepo(owner: string, name: string): RawRepo {
  return {
    owner: { login: owner },
    name,
    full_name: `${owner}/${name}`,
    html_url: `https://github.com/${owner}/${name}`,
    description: null,
    private: false,
  };
}

export function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

export function pageOf(url: string): number {
  return Number(new URL(url).searchParams.get('page') ?? '1');
}

export function rawPr(number: number, title: string, state: string, headRef: string): unknown {
  return {
    number,
    title,
    state,
    draft: false,
    html_url: `https://github.com/azweb76/agent-orchestrator/pull/${number}`,
    head: { ref: headRef },
    base: { ref: 'main' },
    user: { login: 'azweb76' },
    updated_at: '2026-01-15T12:00:00Z',
  };
}
export function searchIssue(overrides: {
  number: number;
  title: string;
  owner?: string;
  repo?: string;
  isPr?: boolean;
}) {
  const owner = overrides.owner ?? 'azweb76';
  const repo = overrides.repo ?? 'agent-orchestrator';
  return {
    number: overrides.number,
    title: overrides.title,
    state: 'open',
    draft: false,
    html_url: `https://github.com/${owner}/${repo}/pull/${overrides.number}`,
    updated_at: '2026-02-01T00:00:00Z',
    user: { login: 'octocat' },
    repository_url: `https://api.github.com/repos/${owner}/${repo}`,
    pull_request: overrides.isPr === false ? undefined : { url: 'https://api.github.com/pulls/1' },
  };
}
export function errorResponse(status: number, body: unknown): Response {
  return {
    ok: false,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

/** 202/204 responses from write endpoints can carry no body at all. */
export function emptyResponse(status: number): Response {
  return {
    ok: true,
    status,
    json: async () => {
      throw new Error('no body');
    },
    text: async () => '',
  } as unknown as Response;
}

export function rawPrDetail(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    number: 42,
    title: 'Add feature',
    body: 'Body text',
    state: 'open',
    draft: false,
    merged: false,
    mergeable: true,
    mergeable_state: 'clean',
    rebaseable: true,
    html_url: 'https://github.com/azweb76/agent-orchestrator/pull/42',
    user: { login: 'dclayton', avatar_url: 'https://avatars/1', html_url: 'https://github.com/dclayton' },
    head: { ref: 'feature/foo', sha: 'a'.repeat(40) },
    base: { ref: 'main', sha: 'b'.repeat(40) },
    additions: 12,
    deletions: 3,
    changed_files: 2,
    commits: 4,
    comments: 1,
    review_comments: 5,
    labels: [{ name: 'enhancement', color: 'a2eeef' }],
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-02T00:00:00Z',
    merged_at: null,
    closed_at: null,
    merge_commit_sha: 'c'.repeat(40),
    ...overrides,
  };
}

export const REPO_SETTINGS = {
  allow_merge_commit: true,
  allow_squash_merge: true,
  allow_rebase_merge: true,
  delete_branch_on_merge: true,
};

/** Route mocked fetches by pathname so parallel detail+settings calls both resolve. */
export function routeFetch(
  t: { mock: { method: typeof import('node:test').mock.method } },
  handlers: Array<[RegExp, (url: string) => Response]>,
) {
  return t.mock.method(globalThis, 'fetch', async (url: string) => {
    for (const [pattern, handler] of handlers) {
      if (pattern.test(new URL(url).pathname)) return handler(url);
    }
    throw new Error(`Unexpected fetch: ${url}`);
  });
}
