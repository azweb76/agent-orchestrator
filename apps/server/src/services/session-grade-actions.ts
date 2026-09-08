import { phaseSkillForTemplate, type SessionGradeFinding } from '@agent-orchestrator/shared';
import type { GradeSkillInfo } from './session-grade-signals.js';

const SKILL_SLUG = /^[a-z0-9][a-z0-9-]{0,62}$/;

export interface SessionGradeGrounding {
  availableSkills: GradeSkillInfo[];
  skippedSkills: string[];
  sessionTemplate?: string;
}

export function slugifySkillName(raw: string): string | undefined {
  const slug = raw
    .trim()
    .toLowerCase()
    .replace(/^\//, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63);
  return SKILL_SLUG.test(slug) ? slug : undefined;
}

export function matchAvailableSkill(
  name: string | undefined,
  available: Array<{ command: string }>,
): string | undefined {
  if (!name?.trim()) return undefined;
  const needle = name.trim().toLowerCase().replace(/^\//, '');
  const slugged = slugifySkillName(name);
  let contained: string | undefined;
  for (const skill of available) {
    const cmd = skill.command.toLowerCase().replace(/^\//, '');
    if (cmd === needle || (slugged && cmd === slugged)) return skill.command.replace(/^\//, '');
    if (slugged && (slugged.includes(cmd) || cmd.includes(slugged))) {
      if (!contained || cmd.length > contained.length) contained = skill.command.replace(/^\//, '');
    }
  }
  return contained;
}

/** Require action.name to be an existing skill or a valid new slug. */
export function groundRecommendedAction(
  action: SessionGradeFinding['recommendedAction'],
  grounding: SessionGradeGrounding,
): SessionGradeFinding['recommendedAction'] {
  if (!action) return action;
  if (action.kind !== 'skill') return action;

  const matched = matchAvailableSkill(action.name, grounding.availableSkills);
  if (matched) {
    return { ...action, name: matched, operation: action.operation === 'create' ? 'update' : action.operation ?? 'update' };
  }

  const skipped = grounding.skippedSkills
    .map((item) => item.replace(/^\//, ''))
    .filter(Boolean);
  if (!action.name && skipped.length > 0 && skipped.length <= 3) {
    const preferred =
      skipped.find((slug) => slug === phaseSkillForTemplate(grounding.sessionTemplate)) ?? skipped[0];
    return { ...action, name: preferred, operation: 'update' };
  }

  const phase = phaseSkillForTemplate(grounding.sessionTemplate);
  if (phase && action.scope !== 'personal' && (!action.name || action.operation !== 'update')) {
    return { ...action, name: phase, operation: 'update', scope: action.scope ?? 'project' };
  }

  const slug = action.name ? slugifySkillName(action.name) : undefined;
  if (action.name && !slug) {
    const { name: _drop, ...rest } = action;
    return rest;
  }
  if (slug) return { ...action, name: slug, operation: action.operation ?? 'create' };
  return action;
}

export function groundSessionGradeFindings(
  findings: SessionGradeFinding[],
  grounding: SessionGradeGrounding,
): SessionGradeFinding[] {
  return findings.map((finding) => ({
    ...finding,
    recommendedAction: groundRecommendedAction(finding.recommendedAction, grounding),
  }));
}
