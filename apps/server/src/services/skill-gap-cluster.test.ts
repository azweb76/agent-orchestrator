import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type { ChatSession, SessionGradeFinding, SessionGradeStats } from '@agent-orchestrator/shared';
import {
  findSkillGapCluster,
  skillGapClusterKey,
  SKILL_GAP_CLUSTER_THRESHOLD,
} from '@agent-orchestrator/shared';
import { createRepositories, initDatabase } from '../db/index.js';
import { buildInstructionOfferSeed, seedInstructionOfferFromFindings } from './instruction-offer-seed.js';

const stats: SessionGradeStats = {
  userTurns: 2,
  assistantTurns: 8,
  estimatedTokens: 4000,
  costUsd: null,
  toolCalls: 6,
  instructionFileCount: 1,
  skillCount: 2,
};

function finding(partial: Partial<SessionGradeFinding> & Pick<SessionGradeFinding, 'title' | 'detail'>): SessionGradeFinding {
  return {
    category: 'skills',
    severity: 'issue',
    ...partial,
  };
}

function gradedSession(
  id: string,
  template: ChatSession['template'],
  findings: SessionGradeFinding[],
): ChatSession {
  return {
    id,
    agentId: 'ag-1',
    title: id,
    template,
    status: 'idle',
    model: 'sonnet',
    effort: 'high',
    permissionMode: 'plan',
    claudeSessionId: null,
    pid: null,
    runLogPath: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    grade: {
      score: 3,
      comment: 'ok',
      gradedAt: '2026-01-01T00:00:00.000Z',
      analysis: { summary: 'ok', findings, stats },
    },
  };
}

test('skillGapClusterKey groups skipped-test wording', () => {
  const a = skillGapClusterKey(
    finding({ title: 'Never ran tests', detail: 'The agent shipped without a test run.' }),
  );
  const b = skillGapClusterKey(
    finding({ title: 'Verification gap', detail: 'Did not run tests after the edit.' }),
  );
  assert.equal(a.key, 'theme:skipped-tests');
  assert.equal(b.key, a.key);
  assert.equal(a.skillSlug, 'always-run-tests');
});

test('findSkillGapCluster waits for the threshold', () => {
  const gap = finding({ title: 'Never ran tests', detail: 'No test command.' });
  const two = findSkillGapCluster(
    [gap],
    [
      { id: 's1', findings: [gap] },
      { id: 's2', findings: [gap] },
    ],
  );
  assert.equal(two, null);

  const three = findSkillGapCluster(
    [gap],
    [
      { id: 's1', findings: [gap] },
      { id: 's2', findings: [gap] },
      { id: 's3', findings: [gap] },
    ],
  );
  assert.equal(three?.count, SKILL_GAP_CLUSTER_THRESHOLD);
  assert.equal(three?.skillSlug, 'always-run-tests');
});

test('seedInstructionOfferFromFindings keeps phase skills until a cluster applies', () => {
  const findings = [
    finding({
      title: 'Never ran tests',
      detail: 'Skipped the suite.',
      recommendedAction: { kind: 'skill', scope: 'project' },
    }),
  ];
  const phase = seedInstructionOfferFromFindings({ template: 'build' }, findings);
  assert.equal(phase.preferredSkillSlug, 'implement-plan');
  assert.equal(phase.scope, 'project');

  const clustered = seedInstructionOfferFromFindings(
    { template: 'build' },
    findings,
    {
      key: 'theme:skipped-tests',
      theme: 'never ran tests',
      skillSlug: 'always-run-tests',
      count: 3,
      sessionIds: ['a', 'b', 'c'],
      titles: ['Never ran tests'],
      details: ['Never ran tests: Skipped the suite.'],
    },
  );
  assert.equal(clustered.scope, 'personal');
  assert.equal(clustered.name, 'always-run-tests');
  assert.equal(clustered.relativePath, undefined);
  assert.match(clustered.findingTitles[0] ?? '', /Repeated across 3 sessions/);
  assert.match(clustered.extraNotes, /one personal skill/);
});

test('buildInstructionOfferSeed clusters lookback grades from the repository', async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'ao-skill-gap-'));
  const db = initDatabase(tmp);
  const repos = createRepositories(db);
  repos.workspaces.create({
    id: 'ws-1',
    name: 'demo',
    repoUrl: 'https://github.com/example/demo',
    repoPath: tmp,
    defaultBranch: 'main',
    githubOwner: 'example',
    githubRepo: 'demo',
    createdAt: '2026-01-01T00:00:00.000Z',
  });
  repos.worktrees.create({
    id: 'wt-1',
    workspaceId: 'ws-1',
    name: 'feat',
    path: tmp,
    branch: 'feat',
    prNumber: null,
    prTitle: null,
    baseBranch: 'main',
    createdAt: '2026-01-01T00:00:00.000Z',
  });
  repos.agents.create({
    id: 'ag-1',
    worktreeId: 'wt-1',
    name: 'Agent',
    status: 'idle',
    model: 'sonnet',
    effort: 'high',
    permissionMode: 'plan',
    claudeSessionId: null,
    pid: null,
    runLogPath: null,
    activeSessionId: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    archivedAt: null,
  });
  const gap = finding({ title: 'Never ran tests', detail: 'No vitest run.' });
  const s1 = gradedSession('sess-a', 'build', [gap]);
  const s2 = gradedSession('sess-b', 'fix-ci', [gap]);
  const s3 = gradedSession('sess-c', 'build', [gap]);
  try {
    for (const session of [s1, s2, s3]) {
      repos.sessions.create({ ...session, grade: undefined });
      repos.sessions.setGrade(session.id, session.grade!, 'transcript');
    }
    const recent = repos.sessions.listRecentlyGraded(10);
    assert.equal(recent.length, 3);
    const { seed, cluster } = buildInstructionOfferSeed(s3, recent);
    assert.equal(cluster?.count, 3);
    assert.equal(seed.scope, 'personal');
    assert.equal(seed.preferredSkillSlug, 'always-run-tests');
  } finally {
    db.close();
    await fs.rm(tmp, { recursive: true, force: true });
  }
});

test('buildInstructionOfferSeed does not cluster two similar grades', () => {
  const gap = finding({ title: 'Never ran tests', detail: 'No vitest run.' });
  const current = gradedSession('sess-c', 'build', [gap]);
  const { cluster, seed } = buildInstructionOfferSeed(current, [
    gradedSession('sess-a', 'build', [gap]),
    current,
  ]);
  assert.equal(cluster, null);
  assert.equal(seed.preferredSkillSlug, 'implement-plan');
});
