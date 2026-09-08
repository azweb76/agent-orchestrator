import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  BUILTIN_AGENT_TASK_SEEDS,
  PHASE_SKILL_SLUGS,
  bumpSkillFrontmatterVersion,
  compareSkillSnapshots,
  parseSkillVersion,
  phaseSkillForTemplate,
  setSkillFrontmatterVersion,
  shouldOfferInstructionDraft,
} from '@agent-orchestrator/shared';
import { createRepositories, initDatabase } from '../db/index.js';
import { ensureBuiltInAgentTasks, listAgentTasks } from './agent-tasks.js';
import { seedInstructionOfferFromFindings } from './instruction-offer-seed.js';
import { ensureBuiltInPhaseSkills, builtInSkillsPackRoot } from './phase-skills.js';
import type { AppContext } from './app-context.js';

test('phaseSkillForTemplate maps delivery templates', () => {
  assert.equal(phaseSkillForTemplate('build'), 'implement-plan');
  assert.equal(phaseSkillForTemplate('review'), 'code-review');
  assert.equal(phaseSkillForTemplate('fix-ci'), 'fix-ci');
  assert.equal(phaseSkillForTemplate('address-review'), 'address-review');
  assert.equal(phaseSkillForTemplate('chat'), 'plan-work');
  assert.equal(phaseSkillForTemplate('create-draft-pr'), null);
});

test('instruction offer templates include review and address-review', () => {
  assert.equal(
    shouldOfferInstructionDraft({
      template: 'review',
      grade: {
        score: 3,
        comment: 'ok',
        gradedAt: '2026-01-01T00:00:00.000Z',
        analysis: {
          summary: 'ok',
          findings: [
            {
              category: 'skills',
              severity: 'warning',
              title: 'Weak skill',
              detail: 'Use Explore',
              recommendedAction: { kind: 'skill', scope: 'project' },
            },
          ],
          stats: {
            userTurns: 1,
            assistantTurns: 4,
            estimatedTokens: 1000,
            costUsd: null,
            toolCalls: 2,
            instructionFileCount: 1,
            skillCount: 1,
          },
        },
      },
    }),
    true,
  );
});

test('seedInstructionOfferFromFindings routes build grades to implement-plan', () => {
  const seed = seedInstructionOfferFromFindings(
    { template: 'build' },
    [
      {
        category: 'skills',
        severity: 'issue',
        title: 'No skill',
        detail: 'Missing tactics',
        recommendedAction: { kind: 'skill', scope: 'project' },
      },
    ],
  );
  assert.equal(seed.preferredSkillSlug, 'implement-plan');
  assert.equal(seed.relativePath, '.claude/skills/implement-plan/SKILL.md');
  assert.equal(seed.name, 'implement-plan');
});

test('seedInstructionOfferFromFindings routes unscoped build skill findings to implement-plan', () => {
  const seed = seedInstructionOfferFromFindings(
    { template: 'build' },
    [
      {
        category: 'skills',
        severity: 'issue',
        title: 'No skill',
        detail: 'Missing tactics',
        recommendedAction: { kind: 'skill' },
      },
    ],
  );
  assert.equal(seed.scope, 'project');
  assert.equal(seed.preferredSkillSlug, 'implement-plan');
});

test('seedInstructionOfferFromFindings keeps an explicit personal skill off the phase path', () => {
  const seed = seedInstructionOfferFromFindings(
    { template: 'build' },
    [
      {
        category: 'skills',
        severity: 'issue',
        title: 'Generic retry habit',
        detail: 'Always rerun tests after edits',
        recommendedAction: {
          kind: 'skill',
          scope: 'personal',
          name: 'rerun-tests',
          operation: 'create',
        },
      },
    ],
  );
  assert.equal(seed.scope, 'personal');
  assert.equal(seed.name, 'rerun-tests');
  assert.equal(seed.preferredSkillSlug, 'rerun-tests');
  assert.equal(seed.relativePath, undefined);
});

test('seedInstructionOfferFromFindings prefers a skills action over a mismatched instruction-file action', () => {
  const seed = seedInstructionOfferFromFindings(
    { template: 'create-draft-pr' },
    [
      {
        category: 'instruction_files',
        severity: 'warning',
        title: 'Turns',
        detail: 'Long',
        recommendedAction: { kind: 'skill' },
      },
      {
        category: 'skills',
        severity: 'issue',
        title: 'Update code-review',
        detail: 'Skipped the listed skill',
        recommendedAction: {
          kind: 'skill',
          scope: 'personal',
          name: 'code-review',
          operation: 'update',
        },
      },
    ],
  );
  assert.equal(seed.name, 'code-review');
  assert.equal(seed.scope, 'personal');
});

test('seedInstructionOfferFromFindings defaults chat skills to personal', () => {
  const seed = seedInstructionOfferFromFindings({ template: 'create-draft-pr' }, [
    {
      category: 'skills',
      severity: 'warning',
      title: 'Missing habit',
      detail: 'No checklist',
    },
  ]);
  assert.equal(seed.kind, 'skill');
  assert.equal(seed.scope, 'personal');
  assert.equal(seed.preferredSkillSlug, undefined);
});

test('skill frontmatter version helpers', () => {
  const base = '---\nname: demo\ndescription: x\nversion: 3\n---\n\n# Demo\n';
  assert.equal(parseSkillVersion(base), 3);
  assert.match(bumpSkillFrontmatterVersion(base), /version: 4/);
  assert.match(setSkillFrontmatterVersion(base, 9), /version: 9/);
  assert.equal(parseSkillVersion('no frontmatter'), 1);
});

test('compareSkillSnapshots reports deltas', () => {
  const previous = {
    skillSlug: 'fix-ci',
    version: 1,
    stats: {
      userTurns: 1,
      assistantTurns: 10,
      estimatedTokens: 5000,
      costUsd: 1,
      toolCalls: 8,
    },
    gradedAt: '2026-01-01T00:00:00.000Z',
    sessionId: 'a',
  };
  const current = {
    ...previous,
    version: 2,
    stats: { ...previous.stats, assistantTurns: 6, estimatedTokens: 3000, costUsd: 0.5 },
    sessionId: 'b',
  };
  const comparison = compareSkillSnapshots(previous, current);
  assert.equal(comparison.deltas.assistantTurns, -4);
  assert.equal(comparison.deltas.estimatedTokens, -2000);
  assert.equal(comparison.deltas.costUsd, -0.5);
});

test('ensureBuiltInPhaseSkills seeds once without overwriting', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ao-skills-'));
  try {
    assert.ok((await fs.readdir(builtInSkillsPackRoot())).length >= PHASE_SKILL_SLUGS.length);
    const first = await ensureBuiltInPhaseSkills(tmp);
    assert.equal(first.seeded.length, PHASE_SKILL_SLUGS.length);
    const skillPath = path.join(tmp, '.claude', 'skills', 'plan-work', 'SKILL.md');
    await fs.writeFile(skillPath, '---\nname: plan-work\nversion: 9\n---\ncustom\n');
    const second = await ensureBuiltInPhaseSkills(tmp);
    assert.equal(second.seeded.length, 0);
    assert.equal(second.skipped.length, PHASE_SKILL_SLUGS.length);
    const kept = await fs.readFile(skillPath, 'utf8');
    assert.match(kept, /version: 9/);
    assert.match(kept, /custom/);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('ensureBuiltInAgentTasks seeds feature/bugfix/refactor once', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ao-tasks-'));
  try {
    const db = initDatabase(tmp);
    const repos = createRepositories(db);
    const ctx = { repos } as AppContext;
    ensureBuiltInAgentTasks(ctx);
    const listed = listAgentTasks(ctx);
    for (const seed of BUILTIN_AGENT_TASK_SEEDS) {
      const task = listed.find((item) => item.name === seed.name);
      assert.ok(task, seed.name);
      assert.equal(task!.builtIn, true);
      assert.match(task!.promptTemplate ?? '', /plan-work/);
    }
    ensureBuiltInAgentTasks(ctx);
    assert.equal(
      listAgentTasks(ctx).filter((item) => item.builtIn).length,
      BUILTIN_AGENT_TASK_SEEDS.length,
    );
    db.close();
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
});
