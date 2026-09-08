import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import {
  composeSkillMarkdown,
  createPersonalSkill,
  deletePersonalSkill,
  getPersonalSkill,
  listPersonalSkills,
  updatePersonalSkill,
} from './personal-skills.js';

describe('personal-skills', () => {
  let home = '';

  before(async () => {
    home = await fs.mkdtemp(path.join(os.tmpdir(), 'ao-personal-skills-'));
    await fs.mkdir(path.join(home, '.claude', 'skills', 'notes'), { recursive: true });
    await fs.writeFile(
      path.join(home, '.claude', 'skills', 'notes', 'SKILL.md'),
      '---\nname: notes\ndescription: Personal notes\n---\n# Notes\n',
    );
  });

  after(async () => {
    if (home) await fs.rm(home, { recursive: true, force: true });
  });

  it('composes frontmatter around a body', () => {
    const markdown = composeSkillMarkdown('retry-tests', 'Run tests after edits', '# Retry\n');
    assert.match(markdown, /^---\nname: retry-tests\ndescription: Run tests after edits\n---\n/);
    assert.match(markdown, /# Retry/);
  });

  it('lists personal skills from the user library', async () => {
    const skills = await listPersonalSkills(home);
    assert.equal(skills.length, 1);
    assert.equal(skills[0]?.slug, 'notes');
    assert.match(skills[0]?.content ?? '', /# Notes/);
  });

  it('creates, updates, and deletes a personal skill', async () => {
    const created = await createPersonalSkill(
      {
        name: 'Retry Tests',
        description: 'Re-run failing tests',
        content: '# Retry tests\n\nAlways re-run the suite.',
      },
      home,
    );
    assert.equal(created.slug, 'retry-tests');
    assert.equal(created.name, 'Retry Tests');
    assert.match(created.content, /Always re-run the suite/);

    await assert.rejects(
      () => createPersonalSkill({ name: 'retry-tests', content: 'dup' }, home),
      /already exists/,
    );

    const updated = await updatePersonalSkill(
      'retry-tests',
      { name: 'Retry tests', description: 'Updated', content: '# Retry\n\nDo it twice.' },
      home,
    );
    assert.equal(updated.name, 'Retry tests');
    assert.match(updated.content, /Do it twice/);

    await deletePersonalSkill('retry-tests', home);
    await assert.rejects(() => getPersonalSkill('retry-tests', home), /not found/);
    const remaining = await listPersonalSkills(home);
    assert.equal(remaining.some((skill) => skill.slug === 'retry-tests'), false);
    assert.equal(remaining.some((skill) => skill.slug === 'notes'), true);
  });
});
