import type {
  GenerateInstructionDraftRequest,
  InstructionDraft,
  InstructionFileKind,
  SessionGradeAnalysis,
  SessionGradeScore,
} from '@agent-orchestrator/shared';
import { sanitizeSkillSlug } from './instruction-files.js';

export interface InstructionDraftPromptInput {
  transcript: string;
  score: SessionGradeScore | null;
  comment: string;
  analysis?: SessionGradeAnalysis | null;
  request: GenerateInstructionDraftRequest;
  existingContent?: string | null;
  existingPath?: string | null;
}

const KIND_LABEL: Record<InstructionFileKind, string> = {
  skill: 'a Claude Code skill (SKILL.md with YAML frontmatter name + description)',
  claude_md: 'a CLAUDE.md project instruction file',
  agents_md: 'an AGENTS.md project instruction file',
};

export function buildInstructionDraftPrompt(input: InstructionDraftPromptInput): {
  system: string;
  user: string;
} {
  const { request, transcript, score, comment, analysis } = input;
  const target = KIND_LABEL[request.kind];
  const scoreLine =
    score == null
      ? 'The session is ungraded.'
      : `This session was graded ${score}/5.${comment ? ` Summary: ${comment}` : ''}`;
  const analysisLine = analysis
    ? [
        'AI session analysis findings:',
        ...analysis.findings.map(
          (item) => `- ${item.category} [${item.severity}] ${item.title}: ${item.detail}`,
        ),
      ].join('\n')
    : '';

  const system = [
    'You turn a coding-agent chat transcript (and its AI grade) into a durable instruction artifact.',
    'Respond with ONLY a JSON object (no markdown fences) with keys:',
    'name (string slug), description (short when-to-use summary), content (full file markdown), rationale (1-3 sentences).',
    'For skills, content MUST start with YAML frontmatter: ---\\nname: slug\\ndescription: ...\\n---',
    'Write concrete, actionable instructions grounded in the transcript. Do not invent repo-specific APIs that were not discussed.',
    'If the grade is low, capture mistakes, missing checks, and corrections. If high, capture what worked so it can be reused.',
    'Keep the file focused; typically 40-120 lines.',
  ].join(' ');

  const parts = [
    `Write ${target}. ${scoreLine}`,
    analysisLine,
    request.extraNotes?.trim() ? `Additional notes from the user:\n${request.extraNotes.trim()}` : '',
    request.name?.trim() ? `Preferred skill name: ${request.name.trim()}` : '',
    input.existingPath
      ? `Update this existing file (${input.existingPath}). Preserve still-useful guidance and merge in new lessons:\n${input.existingContent || '(empty file)'}`
      : 'Create a new file.',
    'Chat transcript:',
    transcript || '(empty transcript)',
  ].filter(Boolean);

  return { system, user: parts.join('\n\n') };
}

function extractJsonObject(raw: string): Record<string, unknown> {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1]!.trim() : trimmed;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start < 0 || end <= start) {
    throw new Error('Instruction draft response was not valid JSON');
  }
  const parsed = JSON.parse(candidate.slice(start, end + 1)) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Instruction draft response was not a JSON object');
  }
  return parsed as Record<string, unknown>;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function parseInstructionDraftResponse(
  raw: string,
  request: GenerateInstructionDraftRequest,
  existing: boolean,
): InstructionDraft {
  const parsed = extractJsonObject(raw);
  const scope = request.kind === 'skill' ? (request.scope ?? 'project') : 'project';
  const action = existing || Boolean(request.relativePath) ? 'update' : 'create';

  let name = asString(parsed.name) || request.name?.trim() || '';
  let relativePath = (request.relativePath ?? '').replaceAll('\\', '/');
  let description = asString(parsed.description);
  const content = asString(parsed.content);
  if (!content) throw new Error('Instruction draft was missing file content');

  if (request.kind === 'claude_md') {
    name = pathBasename(relativePath || 'CLAUDE.md');
    relativePath = relativePath || 'CLAUDE.md';
    if (!description) description = 'Project agent instructions';
  } else if (request.kind === 'agents_md') {
    name = 'AGENTS.md';
    relativePath = 'AGENTS.md';
    if (!description) description = 'Project agent instruction file';
  } else {
    const slug = sanitizeSkillSlug(name || 'session-lesson');
    name = slug;
    relativePath = relativePath || `.claude/skills/${slug}/SKILL.md`;
    if (!description) description = `Skill: ${slug}`;
  }

  return {
    kind: request.kind,
    action,
    scope,
    name,
    description,
    relativePath,
    content,
    rationale: asString(parsed.rationale),
  };
}

function pathBasename(relativePath: string): string {
  const parts = relativePath.split('/');
  return parts[parts.length - 1] || relativePath;
}
