import type {
  ChatSession,
  InstructionFileKind,
  InstructionFileScope,
  SessionGradeFinding,
  SkillGapCluster,
} from '@agent-orchestrator/shared';
import {
  findSkillGapCluster,
  instructionGradeFindings,
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
  cluster?: SkillGapCluster | null;
}

function baseSeedFromFindings(
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

/** Replace N one-off drafts with one personal skill covering the repeated gap. */
export function applySkillGapCluster(
  seed: InstructionOfferSeed,
  cluster: SkillGapCluster,
): InstructionOfferSeed {
  const titles = [
    `Repeated across ${cluster.count} sessions: ${cluster.theme}`,
    ...cluster.titles.filter((title) => title !== cluster.theme),
  ];
  const extraNotes = [
    `Repeated skill gap (${cluster.count} sessions): ${cluster.theme}.`,
    'Write one personal skill covering this habit instead of a per-session one-off draft.',
    ...cluster.details,
    seed.extraNotes,
  ]
    .filter(Boolean)
    .join('\n\n');
  return {
    kind: 'skill',
    scope: 'personal',
    extraNotes,
    findingTitles: titles,
    preferredSkillSlug: cluster.skillSlug,
    name: cluster.skillSlug,
    cluster,
  };
}

/** Route grade findings to a phase skill, or a clustered personal skill when repeated. */
export function seedInstructionOfferFromFindings(
  session: Pick<ChatSession, 'template'>,
  findings: SessionGradeFinding[],
  cluster?: SkillGapCluster | null,
): InstructionOfferSeed {
  const seed = baseSeedFromFindings(session, findings);
  if (!cluster) return seed;
  return applySkillGapCluster(seed, cluster);
}

export function buildInstructionOfferSeed(
  session: Pick<ChatSession, 'id' | 'template' | 'grade'>,
  recentSessions: Array<Pick<ChatSession, 'id' | 'grade'>>,
): { seed: InstructionOfferSeed; cluster: SkillGapCluster | null } {
  const findings = instructionGradeFindings(session.grade);
  const cluster = findSkillGapCluster(
    findings,
    recentSessions.map((item) => ({
      id: item.id,
      findings: instructionGradeFindings(item.grade),
    })),
  );
  return { seed: seedInstructionOfferFromFindings(session, findings, cluster), cluster };
}
