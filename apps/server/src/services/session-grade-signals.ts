import type { AgentEvent, Message, SlashCommand } from '@agent-orchestrator/shared';

/** Skills longer than this are treated as context bloat, like a fat CLAUDE.md. */
export const BLOATED_SKILL_CHARS = 4000;

export interface GradeSkillInfo {
  command: string;
  description: string;
  source?: string;
  charCount?: number;
}

export interface CorrectionSignal {
  kind: 'user_correction' | 'tool_error' | 'permission_denied' | 'rewind';
  detail: string;
}

const USER_CORRECTION =
  /^(no[,.]?\s|nope\b|don't\b|do not\b|stop\b|wrong\b|incorrect\b|that's not|that is not|not that\b|actually[,:]?\s|instead[,:]?\s)/i;

const USER_CORRECTION_INLINE =
  /\b(don't do that|not what i (asked|wanted)|you (ignored|misunderstood)|i said)\b/i;

export function collectSkippedSkills(
  usedSkills: string[],
  available: Array<{ command: string }>,
): string[] {
  const used = new Set(usedSkills.map((item) => item.toLowerCase()));
  return available
    .map((item) => item.command)
    .filter((command) => !used.has(command.toLowerCase()));
}

export function collectOversizedSkills(
  available: GradeSkillInfo[],
  threshold = BLOATED_SKILL_CHARS,
): GradeSkillInfo[] {
  return available.filter((item) => (item.charCount ?? 0) > threshold);
}

export function looksLikeUserCorrection(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  return USER_CORRECTION.test(trimmed) || USER_CORRECTION_INLINE.test(trimmed);
}

export function collectCorrectionSignals(
  messages: Message[],
  events: AgentEvent[] = [],
  sessionId?: string,
): CorrectionSignal[] {
  const signals: CorrectionSignal[] = [];
  let seenAssistant = false;

  for (const message of messages) {
    if (message.role === 'assistant') seenAssistant = true;
    if (message.role === 'user' && seenAssistant && looksLikeUserCorrection(message.content)) {
      signals.push({
        kind: 'user_correction',
        detail: message.content.trim().slice(0, 240),
      });
    }
    for (const part of message.metadata?.timeline ?? []) {
      if (part.type !== 'tool' || part.status !== 'error') continue;
      signals.push({
        kind: 'tool_error',
        detail: `${part.name}${part.detail ? `: ${part.detail}` : ''}`.slice(0, 240),
      });
    }
  }

  for (const event of events) {
    const eventSession = typeof event.data.sessionId === 'string' ? event.data.sessionId : '';
    if (sessionId && eventSession && eventSession !== sessionId) continue;
    if (event.type === 'chat_rewound') {
      const removed = typeof event.data.removed === 'number' ? event.data.removed : 0;
      signals.push({
        kind: 'rewind',
        detail: `User rewound ${removed || 'messages'} to redo a turn.`,
      });
    }
    if (event.type === 'permission_denied') {
      const tool = typeof event.data.toolName === 'string' ? event.data.toolName : 'tool';
      const message = typeof event.data.message === 'string' ? event.data.message : '';
      signals.push({
        kind: 'permission_denied',
        detail: `${tool}${message ? `: ${message}` : ''}`.slice(0, 240),
      });
    }
  }

  return signals.slice(0, 20);
}

export function skillsForGrade(skills: SlashCommand[]): GradeSkillInfo[] {
  return skills
    .filter((item) => item.kind === 'skill')
    .map((item) => ({
      command: item.command,
      description: item.description,
      source: item.source,
      ...(typeof item.charCount === 'number' ? { charCount: item.charCount } : {}),
    }));
}
