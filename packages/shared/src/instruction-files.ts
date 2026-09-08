import type { SkillMetricsComparison } from './phase-skills.js';

/** Kind of agent instruction artifact that can be created or improved. */
export type InstructionFileKind = 'skill' | 'claude_md' | 'agents_md';

/** Skills may be project-local or personal; CLAUDE.md / AGENTS.md are always project. */
export type InstructionFileScope = 'project' | 'personal';

/**
 * New skills default to the user (personal) library so they apply across
 * repos. Use project only when the lesson is tied to this repository.
 */
export const DEFAULT_NEW_SKILL_SCOPE: InstructionFileScope = 'personal';

export function resolveInstructionScope(
  kind: InstructionFileKind,
  scope?: InstructionFileScope | null,
): InstructionFileScope {
  if (kind !== 'skill') return 'project';
  return scope === 'project' || scope === 'personal' ? scope : DEFAULT_NEW_SKILL_SCOPE;
}

export interface InstructionFile {
  kind: InstructionFileKind;
  scope: InstructionFileScope;
  name: string;
  description: string;
  relativePath: string;
  exists: boolean;
}

export interface GenerateInstructionDraftRequest {
  kind: InstructionFileKind;
  scope?: InstructionFileScope;
  /** Existing file to update. Omit to create a new skill or missing instruction file. */
  relativePath?: string;
  /** Hint for a new skill folder name. */
  name?: string;
  extraNotes?: string;
}

export interface InstructionDraft {
  kind: InstructionFileKind;
  action: 'create' | 'update';
  scope: InstructionFileScope;
  name: string;
  description: string;
  relativePath: string;
  content: string;
  rationale: string;
}

export interface ApplyInstructionFileRequest {
  kind: InstructionFileKind;
  scope: InstructionFileScope;
  content: string;
  /** Skill slug, or unused for CLAUDE.md / AGENTS.md. */
  name?: string;
  /** Existing relative path when updating a known file. */
  relativePath?: string;
}

export interface ApplyInstructionFileResponse {
  kind: InstructionFileKind;
  scope: InstructionFileScope;
  relativePath: string;
  action: 'create' | 'update';
}

/** User-library skill (`~/.claude/skills/<slug>/SKILL.md`). */
export interface PersonalSkill {
  slug: string;
  name: string;
  description: string;
  relativePath: string;
  content: string;
}

export interface CreatePersonalSkillRequest {
  /** Folder slug; sanitized to kebab-case. */
  name: string;
  description?: string;
  content: string;
}

export interface UpdatePersonalSkillRequest {
  /** Display name in frontmatter; does not rename the folder. */
  name?: string;
  description?: string;
  content?: string;
}

/** Skill found in a GitHub or workspace repo, before copying into the user library. */
export interface RepoSkillCandidate {
  slug: string;
  name: string;
  description: string;
  dirPath: string;
  alreadyInstalled: boolean;
}

export interface PreviewRepoSkillsRequest {
  /** GitHub URL or `owner/repo`. Ignored when workspaceId is set. */
  repo?: string;
  ref?: string;
  workspaceId?: string;
}

export interface PreviewRepoSkillsResponse {
  owner: string;
  repo: string;
  ref: string;
  skills: RepoSkillCandidate[];
}

export interface InstallRepoSkillsRequest {
  repo?: string;
  ref?: string;
  workspaceId?: string;
  slugs: string[];
  overwrite?: boolean;
}

export interface InstallRepoSkillsResult {
  installed: PersonalSkill[];
  skipped: Array<{ slug: string; reason: string }>;
}

/** User-library Claude Code subagent (`~/.claude/agents/<slug>.md`). */
export interface PersonalAgent {
  slug: string;
  name: string;
  description: string;
  relativePath: string;
  content: string;
}

export interface CreatePersonalAgentRequest {
  /** File slug; sanitized to kebab-case. */
  name: string;
  description?: string;
  content: string;
}

export interface UpdatePersonalAgentRequest {
  /** Display name in frontmatter; does not rename the file. */
  name?: string;
  description?: string;
  content?: string;
}

export interface RepoAgentCandidate {
  slug: string;
  name: string;
  description: string;
  relativePath: string;
  alreadyInstalled: boolean;
}

export interface PreviewRepoAgentsRequest {
  repo?: string;
  ref?: string;
  workspaceId?: string;
}

export interface PreviewRepoAgentsResponse {
  owner: string;
  repo: string;
  ref: string;
  agents: RepoAgentCandidate[];
}

export interface InstallRepoAgentsRequest {
  repo?: string;
  ref?: string;
  workspaceId?: string;
  slugs: string[];
  overwrite?: boolean;
}

export interface InstallRepoAgentsResult {
  installed: PersonalAgent[];
  skipped: Array<{ slug: string; reason: string }>;
}

/**
 * Pending human-gated instruction improvement offer (persisted in automation_state).
 * Writing still requires an explicit apply in the Improve-instructions dialog.
 */
export interface InstructionDraftOffer {
  sessionId: string;
  gradedAt: string;
  findingTitles: string[];
  /** Pre-generated draft when grade-time generation succeeded. */
  draft?: InstructionDraft | null;
  /** Seed for the Improve dialog when opening without a ready draft. */
  kind?: InstructionFileKind;
  scope?: InstructionFileScope;
  extraNotes?: string;
  /** Preferred phase skill slug when routing a skill improvement. */
  preferredSkillSlug?: string;
  /** Pre/post efficiency comparison for the targeted skill, when available. */
  metricsComparison?: SkillMetricsComparison | null;
  /**
   * When similar instruction/skill findings appeared across enough graded
   * sessions, the offer targets one personal skill instead of a one-off draft.
   */
  cluster?: {
    key: string;
    theme: string;
    skillSlug: string;
    count: number;
    sessionIds: string[];
  } | null;
}
