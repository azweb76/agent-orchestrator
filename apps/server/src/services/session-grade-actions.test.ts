import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  groundRecommendedAction,
  matchAvailableSkill,
  slugifySkillName,
} from './session-grade-actions.js';

const available = [
  { command: '/code-review', description: 'Review the diff' },
  { command: '/fix-ci', description: 'Fix CI' },
];

describe('session grade action grounding', () => {
  it('slugifies invented names and matches listed skills', () => {
    assert.equal(slugifySkillName('/Code Review!!'), 'code-review');
    assert.equal(matchAvailableSkill('code-review', available), 'code-review');
    assert.equal(matchAvailableSkill('Code Review Helper', available), 'code-review');
    assert.equal(matchAvailableSkill('invented-habit', available), undefined);
  });

  it('rewrites create-on-existing-skill to update', () => {
    const grounded = groundRecommendedAction(
      { kind: 'skill', scope: 'personal', name: '/code-review', operation: 'create' },
      { availableSkills: available, skippedSkills: ['/code-review'] },
    );
    assert.deepEqual(grounded, {
      kind: 'skill',
      scope: 'personal',
      name: 'code-review',
      operation: 'update',
    });
  });

  it('fills a skipped skill when the model omitted a name', () => {
    const grounded = groundRecommendedAction(
      { kind: 'skill', scope: 'personal' },
      { availableSkills: available, skippedSkills: ['/code-review'] },
    );
    assert.equal(grounded?.name, 'code-review');
    assert.equal(grounded?.operation, 'update');
  });

  it('prefers the phase skill on a build session', () => {
    const grounded = groundRecommendedAction(
      { kind: 'skill', name: 'Totally Invented Tool' },
      {
        availableSkills: available,
        skippedSkills: [],
        sessionTemplate: 'build',
      },
    );
    assert.equal(grounded?.name, 'implement-plan');
    assert.equal(grounded?.operation, 'update');
  });

  it('drops names that cannot become a valid slug', () => {
    const grounded = groundRecommendedAction(
      { kind: 'skill', name: '???' },
      { availableSkills: [], skippedSkills: [] },
    );
    assert.equal(grounded?.name, undefined);
  });
});
