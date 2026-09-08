import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import {
  composeAgentMarkdown,
  createPersonalAgent,
  deletePersonalAgent,
  getPersonalAgent,
  listPersonalAgents,
  updatePersonalAgent,
} from './personal-agents.js';

describe('personal-agents', () => {
  let home = '';

  before(async () => {
    home = await fs.mkdtemp(path.join(os.tmpdir(), 'ao-personal-agents-'));
    await fs.mkdir(path.join(home, '.claude', 'agents'), { recursive: true });
    await fs.writeFile(
      path.join(home, '.claude', 'agents', 'notes.md'),
      '---\nname: notes\ndescription: Personal notes agent\ntools: Read\n---\n# Notes\n',
    );
  });

  after(async () => {
    if (home) await fs.rm(home, { recursive: true, force: true });
  });

  it('composes frontmatter around a body and keeps extra fields', () => {
    const markdown = composeAgentMarkdown(
      'code-reviewer',
      'Review diffs',
      '# Review\n',
      { tools: 'Read, Grep', model: 'sonnet' },
    );
    assert.match(markdown, /^---\nname: code-reviewer\ndescription: Review diffs\ntools: Read, Grep\nmodel: sonnet\n---\n/);
    assert.match(markdown, /# Review/);
  });

  it('lists personal agents from the user library', async () => {
    const agents = await listPersonalAgents(home);
    assert.equal(agents.length, 1);
    assert.equal(agents[0]?.slug, 'notes');
    assert.match(agents[0]?.content ?? '', /# Notes/);
  });

  it('creates, updates, and deletes a personal agent', async () => {
    const created = await createPersonalAgent(
      {
        name: 'Code Reviewer',
        description: 'Review diffs carefully',
        content: '# Review\n\nBe thorough.',
      },
      home,
    );
    assert.equal(created.slug, 'code-reviewer');
    assert.equal(created.name, 'Code Reviewer');
    assert.match(created.content, /Be thorough/);

    await assert.rejects(
      () => createPersonalAgent({ name: 'code-reviewer', content: 'dup' }, home),
      /already exists/,
    );

    const updated = await updatePersonalAgent(
      'code-reviewer',
      { name: 'Code reviewer', description: 'Updated', content: '# Review\n\nDo it twice.' },
      home,
    );
    assert.equal(updated.name, 'Code reviewer');
    assert.match(updated.content, /Do it twice/);

    await deletePersonalAgent('code-reviewer', home);
    await assert.rejects(() => getPersonalAgent('code-reviewer', home), /not found/);
    const remaining = await listPersonalAgents(home);
    assert.equal(remaining.some((agent) => agent.slug === 'code-reviewer'), false);
    assert.equal(remaining.some((agent) => agent.slug === 'notes'), true);

    const kept = await updatePersonalAgent('notes', { content: '# Notes\n\nKeep tools.' }, home);
    assert.match(kept.content, /tools: Read/);
    assert.match(kept.content, /Keep tools/);
  });
});
