import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import {
  applyInstructionFile,
  isAllowedInstructionRelativePath,
  listInstructionFiles,
  resolveInstructionWritePath,
  sanitizeSkillSlug,
} from './instruction-files.js';

describe('instruction-files', () => {
  let tmp = '';
  let home = '';

  before(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ao-instr-'));
    home = path.join(tmp, 'home');
    await fs.mkdir(path.join(tmp, '.claude', 'skills', 'deploy'), { recursive: true });
    await fs.writeFile(
      path.join(tmp, '.claude', 'skills', 'deploy', 'SKILL.md'),
      `---
name: deploy
description: Deploy to staging
---
# Deploy
`,
    );
    await fs.writeFile(path.join(tmp, 'CLAUDE.md'), '# Existing Claude instructions\n');
    await fs.mkdir(path.join(home, '.claude', 'skills', 'notes'), { recursive: true });
    await fs.writeFile(
      path.join(home, '.claude', 'skills', 'notes', 'SKILL.md'),
      `---
name: notes
description: Personal notes skill
---
`,
    );
  });

  after(async () => {
    if (tmp) await fs.rm(tmp, { recursive: true, force: true });
  });

  it('sanitizes skill slugs', () => {
    assert.equal(sanitizeSkillSlug(' API Testing '), 'api-testing');
    assert.throws(() => sanitizeSkillSlug('***'), /Invalid skill name/);
  });

  it('accepts only known instruction paths', () => {
    assert.equal(isAllowedInstructionRelativePath('claude_md', 'CLAUDE.md'), true);
    assert.equal(isAllowedInstructionRelativePath('claude_md', '.claude/CLAUDE.md'), true);
    assert.equal(isAllowedInstructionRelativePath('agents_md', 'AGENTS.md'), true);
    assert.equal(isAllowedInstructionRelativePath('skill', '.claude/skills/foo/SKILL.md'), true);
    assert.equal(isAllowedInstructionRelativePath('claude_md', '../CLAUDE.md'), false);
    assert.equal(isAllowedInstructionRelativePath('skill', '.claude/skills/../secret/SKILL.md'), false);
  });

  it('resolves project and personal skill paths inside the allowed root', () => {
    const project = resolveInstructionWritePath(
      { worktreePath: tmp, homeDir: home },
      { kind: 'skill', scope: 'project', name: 'api-testing', content: 'x' },
    );
    assert.equal(project.relativePath, '.claude/skills/api-testing/SKILL.md');
    assert.ok(project.absolutePath.startsWith(path.resolve(tmp)));

    const personal = resolveInstructionWritePath(
      { worktreePath: tmp, homeDir: home },
      { kind: 'skill', scope: 'personal', name: 'api-testing', content: 'x' },
    );
    assert.ok(personal.absolutePath.startsWith(path.resolve(home)));
  });

  it('rejects path traversal even if a relativePath is supplied', () => {
    assert.throws(
      () =>
        resolveInstructionWritePath(
          { worktreePath: tmp, homeDir: home },
          {
            kind: 'skill',
            scope: 'project',
            relativePath: '.claude/skills/../../etc/passwd',
            content: 'x',
          },
        ),
      /Unsupported instruction file path/,
    );
  });

  it('lists existing project and personal instruction files', async () => {
    const files = await listInstructionFiles({ worktreePath: tmp, homeDir: home });
    const paths = files.map((item) => `${item.scope}:${item.relativePath}`);
    assert.ok(paths.includes('project:CLAUDE.md'));
    assert.ok(paths.includes('project:AGENTS.md'));
    assert.ok(paths.includes('project:.claude/skills/deploy/SKILL.md'));
    assert.ok(paths.includes('personal:.claude/skills/notes/SKILL.md'));
    assert.equal(files.find((item) => item.relativePath === 'CLAUDE.md')?.exists, true);
    assert.equal(files.find((item) => item.relativePath === 'AGENTS.md')?.exists, false);
  });

  it('creates a skill and updates CLAUDE.md', async () => {
    const created = await applyInstructionFile(
      { worktreePath: tmp, homeDir: home },
      {
        kind: 'skill',
        scope: 'project',
        name: 'review-api',
        content: '---\nname: review-api\ndescription: Review APIs\n---\n# Review\n',
      },
    );
    assert.equal(created.action, 'create');
    const skillPath = path.join(tmp, '.claude', 'skills', 'review-api', 'SKILL.md');
    assert.match(await fs.readFile(skillPath, 'utf8'), /Review APIs/);

    const updated = await applyInstructionFile(
      { worktreePath: tmp, homeDir: home },
      { kind: 'claude_md', scope: 'project', content: '# Updated CLAUDE.md\nFollow the API skill.\n' },
    );
    assert.equal(updated.action, 'update');
    assert.match(await fs.readFile(path.join(tmp, 'CLAUDE.md'), 'utf8'), /Updated CLAUDE.md/);
  });
});
