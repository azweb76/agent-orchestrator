import {
  SESSION_GRADE_FINDING_LABELS,
  resolveInstructionScope,
  type InstructionDraftOffer,
  type InstructionFileKind,
  type InstructionFileScope,
  type SessionGradeFinding,
} from '@agent-orchestrator/shared';

export type SessionInsightsTab = 'context' | 'analysis';

export interface FindingImproveSeed {
  kind: InstructionFileKind;
  scope: InstructionFileScope;
  extraNotes: string;
  preferredSkillSlug?: string;
}

/** Kickoff prompt for a new chat that implements one graded finding. */
export function buildFindingImplementPrompt(finding: SessionGradeFinding): string {
  const category = SESSION_GRADE_FINDING_LABELS[finding.category];
  const suggestion = finding.suggestion?.trim() || finding.detail.trim();
  const action = finding.recommendedAction;
  const scopeHint =
    action?.kind === 'skill'
      ? action.scope === 'project'
        ? 'Write a project skill in this worktree only if the lesson is specific to this repository.'
        : 'Prefer a personal (user-scoped) skill so future sessions in any repo can reuse it.'
      : 'Prefer writing or updating the appropriate skill / CLAUDE.md / AGENTS.md if the suggestion calls for it.';
  return [
    '## Problem',
    `${category} — ${finding.title}`,
    finding.detail.trim(),
    '',
    '## Suggestion',
    suggestion,
    '',
    'Implement this improvement.',
    scopeHint,
  ].join('\n');
}

export function seedImproveFromFinding(finding: SessionGradeFinding): FindingImproveSeed {
  const kind = finding.recommendedAction?.kind ?? 'skill';
  const scope = resolveInstructionScope(kind, finding.recommendedAction?.scope);
  const extraNotes = [finding.title, finding.detail, finding.suggestion]
    .map((item) => item?.trim())
    .filter(Boolean)
    .join('\n');
  return {
    kind,
    scope,
    extraNotes,
    preferredSkillSlug: finding.recommendedAction?.name,
  };
}

export function findingImproveLabel(finding: SessionGradeFinding): string {
  const action = finding.recommendedAction;
  if (action?.kind === 'claude_md') return 'Update CLAUDE.md';
  if (action?.kind === 'agents_md') return 'Update AGENTS.md';
  if (!action || action.kind !== 'skill') return 'Improve instructions';
  const personal = action.scope !== 'project';
  if (action.operation === 'update') {
    return personal ? 'Update personal skill' : 'Update project skill';
  }
  return personal ? 'Draft personal skill' : 'Draft project skill';
}

/** Chat banner copy for a persisted or derived instruction-draft offer. */
export function instructionDraftOfferBannerBody(
  templateTitle: string,
  labels: string,
  offer?: InstructionDraftOffer | null,
): string {
  const draft = offer?.draft ? ' (draft ready)' : '';
  if (offer?.cluster && offer.cluster.count >= 2) {
    return (
      `The ${templateTitle} session grade flagged a repeated skill gap (${offer.cluster.theme}) ` +
      `in ${offer.cluster.count} sessions. Review one personal skill draft instead of a one-off${draft}?`
    );
  }
  return (
    `The ${templateTitle} session grade flagged ${labels || 'instruction gaps'}. ` +
    `Review and apply an instruction draft to fold the lessons into this repo${draft}?`
  );
}
