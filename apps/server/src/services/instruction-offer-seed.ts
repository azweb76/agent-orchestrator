import type {
  ChatSession,
  InstructionFileKind,
  InstructionFileScope,
  SessionGradeFinding,
} from '@agent-orchestrator/shared';
import {
  phaseSkillForTemplate,
  phaseSkillRelativePath,
  resolveInstructionScope,
} from '@agent-orchestrator/shared';

export interface InstructionOfferSeed {
  kind: InstructionFileKind;
  scope?: InstructionFileScope;
  extraNotes: string;
  findingTitles: string[];
  preferredSkillSlug?: string;
  relativePath?: string;
  name?: string;
}

/** Route grade findings to a phase skill when the session template maps to one. */
export function seedInstructionOfferFromFindings(
  session: Pick<ChatSession, 'template'>,
  findings: SessionGradeFinding[],
): InstructionOfferSeed {
  const findingTitles = findings.map((item) => item.title).filter(Boolean);
  const withAction = pickOfferFinding(findings);
  const kind = withAction?.recommendedAction?.kind ?? 'skill';
  const explicitScope = withAction?.recommendedAction?.scope;
  const extraNotes = findings
    .map((item) => `${item.title}: ${item.detail}`.trim())
    .filter(Boolean)
    .join('\n');

  const phaseSlug = phaseSkillForTemplate(session.template);
  const usePhaseSkill = kind === 'skill' && Boolean(phaseSlug) && explicitScope !== 'personal';
  if (usePhaseSkill && phaseSlug) {
    return {
      kind: 'skill',
      scope: 'project',
      extraNotes,
      findingTitles,
      preferredSkillSlug: phaseSlug,
      name: phaseSlug,
      relativePath: phaseSkillRelativePath(phaseSlug),
    };
  }

  const scope = kind === 'skill' ? resolveInstructionScope('skill', explicitScope) : explicitScope;
  const skillName = withAction?.recommendedAction?.name;
  return {
    kind,
    scope,
    extraNotes,
    findingTitles,
    name: kind === 'skill' ? skillName : undefined,
    preferredSkillSlug: kind === 'skill' ? skillName : undefined,
  };
}

/** Prefer skills / instruction-file findings whose action kind matches the category. */
export function pickOfferFinding(
  findings: SessionGradeFinding[],
): SessionGradeFinding | undefined {
  const actionable = findings.filter((item) => item.severity !== 'ok');
  const skillsMatch = actionable.find(
    (item) => item.category === 'skills' && item.recommendedAction?.kind === 'skill',
  );
  const fileMatch = actionable.find(
    (item) =>
      item.category === 'instruction_files' &&
      (item.recommendedAction?.kind === 'claude_md' ||
        item.recommendedAction?.kind === 'agents_md'),
  );
  return (
    skillsMatch ??
    fileMatch ??
    actionable.find((item) => item.category === 'skills') ??
    actionable.find((item) => item.category === 'instruction_files') ??
    actionable.find((item) => item.recommendedAction?.kind)
  );
}
