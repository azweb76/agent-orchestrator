import type { AppContext } from './app-context.js';
import { parseRepoSkillSource } from './skill-dirs.js';

export interface RepoLibrarySource {
  repo?: string;
  ref?: string;
  workspaceId?: string;
}

export interface ResolvedRepo {
  owner: string;
  repo: string;
  ref: string;
  filePaths: string[];
  readFile: (filePath: string) => Promise<string>;
}

export async function resolveRepo(ctx: AppContext, body: RepoLibrarySource): Promise<ResolvedRepo> {
  if (body.workspaceId) {
    const workspace = ctx.repos.workspaces.getById(body.workspaceId);
    if (!workspace) throw new Error('Workspace not found');
    const ref = body.ref?.trim() || workspace.defaultBranch || 'HEAD';
    const filePaths = await ctx.git.listPathsAtRef(workspace.repoPath, ref);
    return {
      owner: workspace.githubOwner,
      repo: workspace.githubRepo,
      ref,
      filePaths,
      readFile: async (filePath) => {
        const content = await ctx.git.showFileAtRef(workspace.repoPath, ref, filePath);
        if (content == null) throw new Error(`File not found: ${filePath}`);
        return content;
      },
    };
  }

  const repoInput = body.repo?.trim();
  if (!repoInput) throw new Error('Provide a GitHub repository or workspace');
  const { owner, repo } = parseRepoSkillSource(repoInput);
  const ref = body.ref?.trim() || (await ctx.github.getRepoDefaultBranch(owner, repo));
  const filePaths = await ctx.github.listRepoFilePaths(owner, repo, ref);
  return {
    owner,
    repo,
    ref,
    filePaths,
    readFile: (filePath) => ctx.github.readRepoFileText(owner, repo, filePath, ref),
  };
}
