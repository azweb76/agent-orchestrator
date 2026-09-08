import { describe, expect, it } from 'vitest';
import type { SessionGradeFinding } from '@agent-orchestrator/shared';
import {
  buildFindingImplementPrompt,
  findingImproveLabel,
  instructionDraftOfferBannerBody,
  seedImproveFromFinding,
} from './sessionAnalysis';

describe('buildFindingImplementPrompt', () => {
  it('includes problem, suggestion, and personal-skill guidance', () => {
    const finding: SessionGradeFinding = {
      category: 'skills',
      severity: 'issue',
      title: 'No retry skill',
      detail: 'The agent skipped the verification loop.',
      suggestion: 'Add a /retry-tests skill with the checklist.',
      recommendedAction: { kind: 'skill', scope: 'personal', operation: 'create', name: 'retry-tests' },
    };
    const prompt = buildFindingImplementPrompt(finding);
    expect(prompt).toMatch(/## Problem/);
    expect(prompt).toMatch(/Skills — No retry skill/);
    expect(prompt).toMatch(/skipped the verification loop/);
    expect(prompt).toMatch(/## Suggestion/);
    expect(prompt).toMatch(/\/retry-tests skill/);
    expect(prompt).toMatch(/personal \(user-scoped\) skill/);
  });

  it('falls back to detail when suggestion is missing', () => {
    const finding: SessionGradeFinding = {
      category: 'wasted_tokens',
      severity: 'warning',
      title: 'Rereads',
      detail: 'Read the same file repeatedly.',
    };
    const prompt = buildFindingImplementPrompt(finding);
    expect(prompt).toMatch(/## Suggestion/);
    expect(prompt).toMatch(/Read the same file repeatedly/);
  });
});

describe('seedImproveFromFinding', () => {
  it('defaults new skills to personal scope', () => {
    const seed = seedImproveFromFinding({
      category: 'skills',
      severity: 'issue',
      title: 'Missing checklist',
      detail: 'The agent re-explored the repo every turn.',
      suggestion: 'Add a portable explore-then-act skill.',
    });
    expect(seed.kind).toBe('skill');
    expect(seed.scope).toBe('personal');
    expect(seed.extraNotes).toMatch(/Missing checklist/);
  });

  it('keeps an explicit project skill', () => {
    const seed = seedImproveFromFinding({
      category: 'skills',
      severity: 'warning',
      title: 'API client',
      detail: 'Wrong base URL for this service.',
      recommendedAction: { kind: 'skill', scope: 'project', name: 'payments-api', operation: 'create' },
    });
    expect(seed.scope).toBe('project');
    expect(seed.preferredSkillSlug).toBe('payments-api');
  });
});

describe('findingImproveLabel', () => {
  it('labels a new personal skill', () => {
    expect(
      findingImproveLabel({
        category: 'skills',
        severity: 'issue',
        title: 'x',
        detail: 'y',
        recommendedAction: { kind: 'skill', scope: 'personal', operation: 'create' },
      }),
    ).toBe('Draft personal skill');
  });

  it('labels CLAUDE.md and AGENTS.md actions', () => {
    expect(
      findingImproveLabel({
        category: 'instruction_files',
        severity: 'warning',
        title: 'x',
        detail: 'y',
        recommendedAction: { kind: 'claude_md' },
      }),
    ).toBe('Update CLAUDE.md');
  });
});

describe('instructionDraftOfferBannerBody', () => {
  it('mentions a clustered personal skill', () => {
    const text = instructionDraftOfferBannerBody('Build', 'skills', {
      sessionId: 's1',
      gradedAt: '2026-01-01T00:00:00.000Z',
      findingTitles: ['Never ran tests'],
      cluster: {
        key: 'theme:skipped-tests',
        theme: 'never ran tests',
        skillSlug: 'always-run-tests',
        count: 3,
        sessionIds: ['a', 'b', 'c'],
      },
      draft: { kind: 'skill', action: 'create', scope: 'personal', name: 'always-run-tests', description: 'x', relativePath: 'x', content: 'x', rationale: 'x' },
    });
    expect(text).toMatch(/repeated skill gap \(never ran tests\)/);
    expect(text).toMatch(/3 sessions/);
    expect(text).toMatch(/personal skill draft/);
    expect(text).toMatch(/draft ready/);
  });

  it('falls back to the per-session copy', () => {
    const text = instructionDraftOfferBannerBody('Fix CI', 'skills and instruction files', {
      sessionId: 's1',
      gradedAt: '2026-01-01T00:00:00.000Z',
      findingTitles: ['Weak skill'],
    });
    expect(text).toMatch(/Fix CI session grade flagged skills and instruction files/);
    expect(text).not.toMatch(/repeated skill gap/);
  });
});
