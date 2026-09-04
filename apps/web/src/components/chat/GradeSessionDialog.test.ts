import { describe, expect, it } from 'vitest';
import type { SessionGradeFinding } from '@agent-orchestrator/shared';
import { buildFindingImplementPrompt } from './GradeSessionDialog';

describe('buildFindingImplementPrompt', () => {
  it('includes problem, suggestion, and implement guidance', () => {
    const finding: SessionGradeFinding = {
      category: 'skills',
      severity: 'issue',
      title: 'No retry skill',
      detail: 'The agent skipped the verification loop.',
      suggestion: 'Add a /retry-tests skill with the checklist.',
    };
    const prompt = buildFindingImplementPrompt(finding);
    expect(prompt).toMatch(/## Problem/);
    expect(prompt).toMatch(/Skills — No retry skill/);
    expect(prompt).toMatch(/skipped the verification loop/);
    expect(prompt).toMatch(/## Suggestion/);
    expect(prompt).toMatch(/\/retry-tests skill/);
    expect(prompt).toMatch(/Implement this improvement/);
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
