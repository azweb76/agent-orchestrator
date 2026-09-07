import { describe, expect, it } from 'vitest';
import type { SessionGradeFinding } from '@agent-orchestrator/shared';
import {
  buildFindingImplementPrompt,
  findingImproveLabel,
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
});
