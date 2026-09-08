import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type {
  InstallRepoSkillsRequest,
  InstallRepoSkillsResult,
  PersonalSkill,
  PreviewRepoSkillsRequest,
  PreviewRepoSkillsResponse,
  RepoSkillCandidate,
} from '@agent-orchestrator/shared';
import type { AppContext } from './app-context.js';
import { listPersonalSkills } from './personal-skills.js';
import { resolveRepo } from './repo-source.js';
import { findSkillDirs, parseSkillFrontmatter, skillRelativeFiles } from './skill-dirs.js';

const MAX_SKILL_FILES = 80;
const SKILL_MD = 'SKILL.md';

function personalSkillsRoot(homeDir?: string): string {
  return path.join(homeDir ?? os.homedir(), '.claude', 'skills');
}

async function alreadyInstalledSlugs(homeDir?: string): Promise<Set<string>> {
  const skills = await listPersonalSkills(homeDir);
  return new Set(skills.map((skill) => skill.slug));
}

async function toCandidate(
  dir: { slug: string; dirPath: string },
  readFile: (filePath: string) => Promise<string>,
  installed: Set<string>,
): Promise<RepoSkillCandidate> {
  const skillMdPath = dir.dirPath ? `${dir.dirPath}/${SKILL_MD}` : SKILL_MD;
  const markdown = await readFile(skillMdPath).catch(() => '');
  const meta = parseSkillFrontmatter(markdown);
  return {
    slug: dir.slug,
    name: meta.name || dir.slug,
    description: meta.description || `Skill: ${meta.name || dir.slug}`,
    dirPath: dir.dirPath || '.',
    alreadyInstalled: installed.has(dir.slug),
  };
}

export async function previewRepoSkills(
  ctx: AppContext,
  body: PreviewRepoSkillsRequest,
  homeDir?: string,
): Promise<PreviewRepoSkillsResponse> {
  const resolved = await resolveRepo(ctx, body);
  const installed = await alreadyInstalledSlugs(homeDir);
  const dirs = findSkillDirs(resolved.filePaths, resolved.repo.toLowerCase());
  const skills = await Promise.all(dirs.map((dir) => toCandidate(dir, resolved.readFile, installed)));
  return {
    owner: resolved.owner,
    repo: resolved.repo,
    ref: resolved.ref,
    skills,
  };
}

function destPathFor(homeDir: string | undefined, slug: string, dirPath: string, filePath: string): string {
  const root = path.join(personalSkillsRoot(homeDir), slug);
  const prefix = dirPath ? `${dirPath.replace(/\/$/, '')}/` : '';
  const relative = prefix ? filePath.slice(prefix.length) : filePath;
  const dest = path.resolve(root, relative);
  const rel = path.relative(root, dest);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error('Path escapes skill directory');
  }
  return dest;
}

export async function installRepoSkills(
  ctx: AppContext,
  body: InstallRepoSkillsRequest,
  homeDir?: string,
): Promise<InstallRepoSkillsResult> {
  const slugs = [...new Set(body.slugs.map((slug) => slug.trim()).filter(Boolean))];
  if (slugs.length === 0) throw new Error('Select at least one skill');
  if (slugs.length > 40) throw new Error('Too many skills in one install');

  const resolved = await resolveRepo(ctx, body);
  const dirs = findSkillDirs(resolved.filePaths, resolved.repo.toLowerCase());
  const installedExisting = await alreadyInstalledSlugs(homeDir);
  const installed: PersonalSkill[] = [];
  const skipped: Array<{ slug: string; reason: string }> = [];

  for (const slug of slugs) {
    const dir = dirs.find((item) => item.slug === slug);
    if (!dir) {
      skipped.push({ slug, reason: 'Not found in repository' });
      continue;
    }
    if (installedExisting.has(slug) && !body.overwrite) {
      skipped.push({ slug, reason: 'Already installed' });
      continue;
    }

    const files = skillRelativeFiles(resolved.filePaths, dir.dirPath);
    if (files.length === 0) {
      skipped.push({ slug, reason: 'Skill folder is empty' });
      continue;
    }
    if (files.length > MAX_SKILL_FILES) {
      skipped.push({ slug, reason: `Too many files (${files.length})` });
      continue;
    }

    const destRoot = path.join(personalSkillsRoot(homeDir), slug);
    try {
      await fs.rm(destRoot, { recursive: true, force: true });
      for (const filePath of files) {
        const content = await resolved.readFile(filePath);
        const dest = destPathFor(homeDir, slug, dir.dirPath, filePath);
        await fs.mkdir(path.dirname(dest), { recursive: true });
        await fs.writeFile(dest, content.endsWith('\n') ? content : `${content}\n`, 'utf8');
      }
      const skills = await listPersonalSkills(homeDir);
      const created = skills.find((skill) => skill.slug === slug);
      if (!created) {
        skipped.push({ slug, reason: 'Install did not produce SKILL.md' });
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
