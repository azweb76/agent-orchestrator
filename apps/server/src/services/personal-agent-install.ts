import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type {
  InstallRepoAgentsRequest,
  InstallRepoAgentsResult,
  PersonalAgent,
  PreviewRepoAgentsRequest,
  PreviewRepoAgentsResponse,
  RepoAgentCandidate,
} from '@agent-orchestrator/shared';
import type { AppContext } from './app-context.js';
import { findAgentFiles } from './agent-files.js';
import { listPersonalAgents } from './personal-agents.js';
import { resolveRepo } from './repo-source.js';
import { parseSkillFrontmatter } from './skill-dirs.js';

function agentsRoot(homeDir?: string): string {
  return path.join(homeDir ?? os.homedir(), '.claude', 'agents');
}

function destPathFor(homeDir: string | undefined, slug: string): string {
  const root = agentsRoot(homeDir);
  const dest = path.resolve(root, `${slug}.md`);
  const rel = path.relative(root, dest);
  if (rel.startsWith('..') || path.isAbsolute(rel) || path.dirname(dest) !== path.resolve(root)) {
    throw new Error('Path escapes agents directory');
  }
  return dest;
}

async function alreadyInstalledSlugs(homeDir?: string): Promise<Set<string>> {
  const agents = await listPersonalAgents(homeDir);
  return new Set(agents.map((agent) => agent.slug));
}

async function toCandidate(
  file: { slug: string; relativePath: string },
  readFile: (filePath: string) => Promise<string>,
  installed: Set<string>,
): Promise<RepoAgentCandidate> {
  const markdown = await readFile(file.relativePath).catch(() => '');
  const meta = parseSkillFrontmatter(markdown);
  return {
    slug: file.slug,
    name: meta.name || file.slug,
    description: meta.description || `Agent: ${meta.name || file.slug}`,
    relativePath: file.relativePath,
    alreadyInstalled: installed.has(file.slug),
  };
}

export async function previewRepoAgents(
  ctx: AppContext,
  body: PreviewRepoAgentsRequest,
  homeDir?: string,
): Promise<PreviewRepoAgentsResponse> {
  const resolved = await resolveRepo(ctx, body);
  const installed = await alreadyInstalledSlugs(homeDir);
  const files = findAgentFiles(resolved.filePaths);
  const agents = await Promise.all(files.map((file) => toCandidate(file, resolved.readFile, installed)));
  return {
    owner: resolved.owner,
    repo: resolved.repo,
    ref: resolved.ref,
    agents,
  };
}

export async function installRepoAgents(
  ctx: AppContext,
  body: InstallRepoAgentsRequest,
  homeDir?: string,
): Promise<InstallRepoAgentsResult> {
  const slugs = [...new Set(body.slugs.map((slug) => slug.trim()).filter(Boolean))];
  if (slugs.length === 0) throw new Error('Select at least one agent');
  if (slugs.length > 40) throw new Error('Too many agents in one install');

  const resolved = await resolveRepo(ctx, body);
  const files = findAgentFiles(resolved.filePaths);
  const installedExisting = await alreadyInstalledSlugs(homeDir);
  const installed: PersonalAgent[] = [];
  const skipped: Array<{ slug: string; reason: string }> = [];

  for (const slug of slugs) {
    const file = files.find((item) => item.slug === slug);
    if (!file) {
      skipped.push({ slug, reason: 'Not found in repository' });
      continue;
    }
    if (installedExisting.has(slug) && !body.overwrite) {
      skipped.push({ slug, reason: 'Already installed' });
      continue;
    }

    try {
      const content = await resolved.readFile(file.relativePath);
      const dest = destPathFor(homeDir, slug);
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.writeFile(dest, content.endsWith('\n') ? content : `${content}\n`, 'utf8');
      const agents = await listPersonalAgents(homeDir);
      const created = agents.find((agent) => agent.slug === slug);
      if (!created) {
        skipped.push({ slug, reason: 'Install did not produce agent markdown' });
        continue;
      }
      installed.push(created);
      installedExisting.add(slug);
    } catch (error) {
      skipped.push({ slug, reason: error instanceof Error ? error.message : 'Install failed' });
    }
  }

  return { installed, skipped };
}
