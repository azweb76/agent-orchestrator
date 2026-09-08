import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PHASE_SKILL_SLUGS, type PhaseSkillSlug } from '@agent-orchestrator/shared';

const PACK_ROOT = path.resolve(fileURLToPath(new URL('../../skills', import.meta.url)));

export function builtInSkillsPackRoot(): string {
  return PACK_ROOT;
}

/**
 * Copy missing orchestrator phase skills into a worktree.
 * Never overwrites an existing SKILL.md so graded improvements stick.
 * Do not call this from agent create or slash-command discovery — those paths
 * must not write files into the worktree.
 */
export async function ensureBuiltInPhaseSkills(worktreePath: string): Promise<{
  seeded: PhaseSkillSlug[];
  skipped: PhaseSkillSlug[];
}> {
  const seeded: PhaseSkillSlug[] = [];
  const skipped: PhaseSkillSlug[] = [];

  for (const slug of PHASE_SKILL_SLUGS) {
    const destDir = path.join(worktreePath, '.claude', 'skills', slug);
    const destFile = path.join(destDir, 'SKILL.md');
    try {
      await fs.access(destFile);
      skipped.push(slug);
      continue;
    } catch {
      // missing — seed
    }

    const sourceFile = path.join(PACK_ROOT, slug, 'SKILL.md');
    try {
      const content = await fs.readFile(sourceFile, 'utf8');
      await fs.mkdir(destDir, { recursive: true });
      await fs.writeFile(destFile, content, { flag: 'wx' });
      seeded.push(slug);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'EEXIST') {
        skipped.push(slug);
        continue;
      }
      console.warn(`[phase-skills] failed to seed ${slug} into ${worktreePath}:`, error);
    }
  }

  return { seeded, skipped };
}
