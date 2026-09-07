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
  const withAction = findings.find((item) => item.recommendedAction?.kind);
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
