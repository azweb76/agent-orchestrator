import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { findSkillDirs, parseRepoSkillSource, skillRelativeFiles } from './skill-dirs.js';

describe('skill-dirs', () => {
  it('parses GitHub URLs and owner/repo shorthand', () => {
    assert.deepEqual(parseRepoSkillSource('azweb76/agent-orchestrator'), {
      owner: 'azweb76',
      repo: 'agent-orchestrator',
    });
    assert.deepEqual(parseRepoSkillSource('https://github.com/acme/skills.git'), {
      owner: 'acme',
      repo: 'skills',
    });
    assert.throws(() => parseRepoSkillSource('not a repo'), /Invalid GitHub/);
  });

  it('finds Claude skill folders and skips synced', () => {
    const dirs = findSkillDirs(
      [
        '.claude/skills/plan-work/SKILL.md',
        '.claude/skills/plan-work/notes.md',
        '.claude/skills/synced/foo/SKILL.md',
        'skills/review/SKILL.md',
        'SKILL.md',
        'README.md',
      ],
      'root-skill',
    );
    assert.deepEqual(
      dirs.map((d) => d.slug),
      ['plan-work', 'review', 'root-skill'],
    );
    assert.equal(dirs.find((d) => d.slug === 'plan-work')?.dirPath, '.claude/skills/plan-work');
    assert.equal(dirs.find((d) => d.slug === 'root-skill')?.dirPath, '');
  });

  it('lists files under a skill directory', () => {
    const files = skillRelativeFiles(
      [
        '.claude/skills/plan-work/SKILL.md',
        '.claude/skills/plan-work/scripts/run.sh',
        '.claude/skills/other/SKILL.md',
      ],
      '.claude/skills/plan-work',
    );
    assert.deepEqual(files.sort(), [
      '.claude/skills/plan-work/SKILL.md',
      '.claude/skills/plan-work/scripts/run.sh',
    ]);
  });
});
