import type {
  Message,
  SessionContextAttribution,
  SessionGradeAnalysis,
  SessionGradeFinding,
  SessionGradeFindingCategory,
  SessionGradeFindingSeverity,
  SessionGradeScore,
  SessionGradeStats,
  SlashCommand,
} from '@agent-orchestrator/shared';
import {
  SESSION_GRADE_FINDING_CATEGORIES,
  SESSION_GRADE_SCORES,
  estimateTokensFromChars,
} from '@agent-orchestrator/shared';
import { extractJsonObject } from './extract-json-object.js';
import { buildSessionTranscript } from './session-transcript.js';
import type { InstructionFileExcerpt } from './instruction-files.js';

export interface SessionGradeContext {
  transcript: string;
  stats: SessionGradeStats;
  tools: Array<{ name: string; count: number }>;
  usedSkills: string[];
  availableSkills: Array<{ command: string; description: string; source?: string }>;
  instructionFiles: InstructionFileExcerpt[];
  notes?: string;
  sessionTitle: string;
  model: string;
  permissionMode: string;
  sessionFilePath?: string | null;
  /** Chat session template id when known (routes skill recommendations). */
  sessionTemplate?: string;
  contextAttribution?: SessionContextAttribution | null;
}

export function collectToolCounts(messages: Message[]): Array<{ name: string; count: number }> {
  const counts = new Map<string, number>();
  for (const message of messages) {
    for (const part of message.metadata?.timeline ?? []) {
      if (part.type !== 'tool') continue;
      const name = part.name.trim() || 'tool';
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export function collectUsedSkills(messages: Message[], skills: SlashCommand[]): string[] {
  const names = new Map<string, string>();
  for (const skill of skills.filter((item) => item.kind === 'skill')) {
    names.set(skill.command.toLowerCase(), skill.command);
    names.set(skill.command.replace(/^\//, '').toLowerCase(), skill.command);
    for (const alias of skill.aliases ?? []) {
      names.set(alias.toLowerCase(), skill.command);
      names.set(alias.replace(/^\//, '').toLowerCase(), skill.command);
    }
  }

  const used = new Set<string>();
  for (const message of messages) {
    if (message.role === 'user') {
      const token = message.content.trim().split(/\s+/)[0]?.toLowerCase();
      if (token && names.has(token)) used.add(names.get(token)!);
    }
    for (const part of message.metadata?.timeline ?? []) {
      if (part.type !== 'tool') continue;
      if (part.name !== 'Skill' && part.name !== 'skill') continue;
      const detail = (part.detail ?? '').trim();
      if (!detail) continue;
      const key = detail.toLowerCase();
      used.add(names.get(key) ?? names.get(key.replace(/^\//, '')) ?? detail);
    }
  }
  return [...used];
}

export function buildSessionGradeStats(
  messages: Message[],
  instructionFiles: InstructionFileExcerpt[],
  skillCount: number,
): SessionGradeStats {
  let userTurns = 0;
  let assistantTurns = 0;
  let transcriptChars = 0;
  let costUsd = 0;
  let hasCost = false;
  let toolCalls = 0;

  for (const message of messages) {
    if (message.role === 'user') userTurns += 1;
    if (message.role === 'assistant') assistantTurns += 1;
    transcriptChars += message.content.length;
    for (const part of message.metadata?.timeline ?? []) {
      if (part.type === 'text') transcriptChars += part.text.length;
      if (part.type === 'tool') toolCalls += 1;
    }
    const cost = message.metadata?.costUsd;
    if (typeof cost === 'number' && Number.isFinite(cost)) {
      costUsd += cost;
      hasCost = true;
    }
  }

  const instructionChars = instructionFiles
    .filter((file) => file.exists)
    .reduce((sum, file) => sum + file.charCount, 0);

  return {
    userTurns,
    assistantTurns,
    estimatedTokens: estimateTokensFromChars(transcriptChars + instructionChars),
    costUsd: hasCost ? Number(costUsd.toFixed(4)) : null,
    toolCalls,
    instructionFileCount: instructionFiles.filter((file) => file.exists).length,
    skillCount,
  };
}

export function buildSessionGradeContext(input: {
  messages: Message[];
  instructionFiles: InstructionFileExcerpt[];
  skills: SlashCommand[];
  sessionTitle: string;
  model: string;
  permissionMode: string;
  notes?: string;
  sessionFilePath?: string | null;
  usageTokens?: number | null;
  costUsd?: number | null;
  sessionTemplate?: string;
  contextAttribution?: SessionContextAttribution | null;
}): SessionGradeContext {
  const skillCommands = input.skills.filter((item) => item.kind === 'skill');
  const stats = buildSessionGradeStats(input.messages, input.instructionFiles, skillCommands.length);
  if (typeof input.usageTokens === 'number' && input.usageTokens > 0) {
    stats.estimatedTokens = input.usageTokens;
  }
  if (typeof input.costUsd === 'number' && Number.isFinite(input.costUsd)) {
    stats.costUsd = input.costUsd;
  }
  return {
    transcript: buildSessionTranscript(input.messages),
    stats,
    tools: collectToolCounts(input.messages),
    usedSkills: collectUsedSkills(input.messages, skillCommands),
    availableSkills: skillCommands.map((item) => ({
      command: item.command,
      description: item.description,
      source: item.source,
    })),
    instructionFiles: input.instructionFiles,
    notes: input.notes?.trim() || undefined,
    sessionTitle: input.sessionTitle,
    model: input.model,
    permissionMode: input.permissionMode,
    sessionFilePath: input.sessionFilePath?.trim() || undefined,
    sessionTemplate: input.sessionTemplate,
    contextAttribution: input.contextAttribution ?? null,
  };
}

export function buildSessionGradePrompt(context: SessionGradeContext): {
  system: string;
  user: string;
} {
  const system = [
    'You grade a coding-agent chat session for efficiency and instruction quality.',
    'Optimize for three outcomes: (1) speed — fewer turns and less exploratory thrash to reach a correct result;',
    '(2) token efficiency — avoid re-reads, redundant tool calls, and bloated context;',
    '(3) fewer corrections — surface standing instructions or skills that would have prevented rework, wrong assumptions, or human fix-up loops.',
    'Look at excessive turns, wasted tokens, bloated context, misconfigured instruction files, and missing or weak skills.',
    'Judge whether the agent used Explore/Task subagents and phase skills (plan-work, implement-plan, code-review, fix-ci, address-review) when appropriate.',
    'The skills finding must say how future sessions get better: update an existing listed skill, or propose a new skill with a kebab-case slug in action.name.',
    'When recommending a skill fix for a phase session, prefer updating the matching phase skill over inventing a new skill slug.',
    'New skills belong in the user/personal scope unless the practice is truly specific to this repository (its APIs, layout, conventions, or tooling). Generic agent habits, checklists, and workflows are personal.',
    'Set action.operation to update when changing an existing skill, or create for a new skill. Set action.scope to personal or project accordingly.',
    'Call the submit_session_grade tool with a JSON object whose keys are quoted:',
    '"score" (integer 1-5), "summary" (2-4 sentences), "findings" (array).',
    'If you cannot call a tool, respond with ONLY that JSON object (no markdown fences or extra text).',
    'Each finding is {"category":"...","severity":"...","title":"...","detail":"...","suggestion":"...","action":{"kind":"...","scope":"...","name":"...","operation":"..."}}.',
    'category must be one of: excessive_turns, wasted_tokens, bloated_context, instruction_files, skills.',
    'severity must be ok, warning, or issue.',
    'For every finding with severity warning or issue, include "suggestion" (1-3 sentences: what to change and how) and "action" recommending the remediation target.',
    'Prefer suggestions that permanently reduce future turns, tokens, or correction cycles (skills / CLAUDE.md / AGENTS.md), not one-off advice for this chat alone.',
    'action.kind must be one of: skill, claude_md, agents_md. Use skill when the fix is a reusable practice or checklist for the agent to follow; use claude_md or agents_md when the fix is project-specific standing instructions (match whichever instruction file this project actually uses).',
    'When action.kind is skill, set action.scope: default personal (user-wide). Use project only when the lesson cannot transfer to other repos.',
    'Omit "suggestion" and "action" for findings with severity ok.',
    'Include exactly one finding for each of those five categories. Use ok when that area looks healthy.',
    'Ground every finding in the supplied stats, context attribution, session-file transcript, instruction files, and skills. Do not invent files or tools that are not listed.',
    'Name the largest context bucket (conversation, tool results, skills, CLAUDE.md/AGENTS.md, memory, or other) and suggest a cut: trim a skill, stop re-reading a file, compact earlier, or slim instruction files.',
    'Score: 5 efficient, 4 good, 3 mixed, 2 wasteful, 1 poor.',
  ].join(' ');

  const instructionSummary = context.instructionFiles.map((file) => ({
    path: file.relativePath,
    scope: file.scope,
    exists: file.exists,
    charCount: file.charCount,
    excerpt: file.excerpt || undefined,
  }));

  const user = [
    `Session: ${context.sessionTitle}`,
    `Model: ${context.model}`,
    `Permission mode: ${context.permissionMode}`,
    context.sessionTemplate ? `Session template: ${context.sessionTemplate}` : '',
    context.sessionFilePath
      ? `Session file (source of this analysis): ${context.sessionFilePath}`
      : '',
    context.notes ? `Operator notes:\n${context.notes}` : '',
    'Measured stats (JSON):',
    JSON.stringify(
      {
        stats: context.stats,
        tools: context.tools,
        usedSkills: context.usedSkills,
        availableSkills: context.availableSkills,
        instructionFiles: instructionSummary,
        contextAttribution: context.contextAttribution ?? null,
      },
      null,
      2,
    ),
    context.sessionFilePath ? 'Transcript extracted from the session file:' : 'Chat transcript:',
    context.transcript || '(empty transcript)',
  ]
    .filter(Boolean)
    .join('\n\n');

  return { system, user };
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function parseScore(value: unknown): SessionGradeScore | null {
  const score = typeof value === 'number' ? value : Number(value);
  if (!SESSION_GRADE_SCORES.includes(score as SessionGradeScore)) return null;
  return score as SessionGradeScore;
}

function parseSeverity(value: unknown): SessionGradeFindingSeverity {
  if (value === 'ok' || value === 'warning' || value === 'issue') return value;
  return 'warning';
}

function parseCategory(value: unknown): SessionGradeFindingCategory | null {
  if (typeof value !== 'string') return null;
  return SESSION_GRADE_FINDING_CATEGORIES.includes(value as SessionGradeFindingCategory)
    ? (value as SessionGradeFindingCategory)
    : null;
}

const INSTRUCTION_FILE_KINDS = ['skill', 'claude_md', 'agents_md'] as const;
const INSTRUCTION_FILE_SCOPES = ['project', 'personal'] as const;
const SKILL_OPERATIONS = ['create', 'update'] as const;

function parseRecommendedAction(
  value: unknown,
  severity: SessionGradeFindingSeverity,
): SessionGradeFinding['recommendedAction'] {
  if (severity === 'ok') return undefined;

  const row = value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
  const kind = row ? asString(row.kind) : '';
  const scope = row ? asString(row.scope) : '';
  const name = row ? asString(row.name) : '';
  const operation = row ? asString(row.operation) : '';

  if (INSTRUCTION_FILE_KINDS.includes(kind as (typeof INSTRUCTION_FILE_KINDS)[number])) {
    const parsedKind = kind as (typeof INSTRUCTION_FILE_KINDS)[number];
    const validScope = INSTRUCTION_FILE_SCOPES.includes(
      scope as (typeof INSTRUCTION_FILE_SCOPES)[number],
    )
      ? (scope as (typeof INSTRUCTION_FILE_SCOPES)[number])
      : undefined;
    const parsedOperation = SKILL_OPERATIONS.includes(
      operation as (typeof SKILL_OPERATIONS)[number],
    )
      ? (operation as (typeof SKILL_OPERATIONS)[number])
      : undefined;
    return {
      kind: parsedKind,
      ...(validScope ? { scope: validScope } : {}),
      ...(parsedKind === 'skill' && name ? { name } : {}),
      ...(parsedKind === 'skill' && parsedOperation ? { operation: parsedOperation } : {}),
    };
  }

  return { kind: 'skill' };
}

function scoreFromFindings(findings: SessionGradeFinding[]): SessionGradeScore {
  const issues = findings.filter((item) => item.severity === 'issue').length;
  const warnings = findings.filter((item) => item.severity === 'warning').length;
  const score = 5 - issues * 2 - warnings;
  if (score <= 1) return 1;
  if (score >= 5) return 5;
  return score as SessionGradeScore;
}

function defaultFinding(category: SessionGradeFindingCategory): SessionGradeFinding {
  return {
    category,
    severity: 'ok',
    title: 'No issues noted',
    detail: 'The model did not flag this area.',
  };
}

export function parseSessionGradeResponse(
  raw: unknown,
  stats: SessionGradeStats,
): SessionGradeAnalysis & { score: SessionGradeScore } {
  const parsed = extractJsonObject(raw, 'Session grade response');
  const findings: SessionGradeFinding[] = [];
  if (Array.isArray(parsed.findings)) {
    for (const item of parsed.findings) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
      const row = item as Record<string, unknown>;
      const category = parseCategory(row.category);
      if (!category) continue;
      const title = asString(row.title) || 'Finding';
      const severity = parseSeverity(row.severity);
      const detail = asString(row.detail);
      const suggestion =
        severity === 'ok' ? undefined : asString(row.suggestion) || detail || undefined;
      findings.push({
        category,
        severity,
        title,
        detail,
        suggestion,
        recommendedAction: parseRecommendedAction(row.action, severity),
      });
    }
  }

  const byCategory = new Map<SessionGradeFindingCategory, SessionGradeFinding>();
  for (const finding of findings) {
    if (!byCategory.has(finding.category)) byCategory.set(finding.category, finding);
  }
  const normalized = SESSION_GRADE_FINDING_CATEGORIES.map(
    (category) => byCategory.get(category) ?? defaultFinding(category),
  );

  const summary = asString(parsed.summary);
  if (!summary) throw new Error('Session grade was missing a summary');

  return {
    score: parseScore(parsed.score) ?? scoreFromFindings(normalized),
    summary,
    findings: normalized,
    stats,
  };
}
