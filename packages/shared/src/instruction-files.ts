/** Kind of agent instruction artifact that can be created or improved. */
export type InstructionFileKind = 'skill' | 'claude_md' | 'agents_md';

/** Skills may be project-local or personal; CLAUDE.md / AGENTS.md are always project. */
export type InstructionFileScope = 'project' | 'personal';

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
}
