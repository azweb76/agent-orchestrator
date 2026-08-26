import { coalesceTimelineText, type Message } from '@agent-orchestrator/shared';

const MAX_MESSAGE_CHARS = 4000;
const MAX_TRANSCRIPT_CHARS = 32_000;

function messageBody(message: Message): string {
  const direct = message.content.trim();
  if (direct) return direct;
  return coalesceTimelineText(message.metadata?.timeline ?? []).trim();
}

function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n…`;
}

/** Compact role-prefixed transcript used for grading and instruction drafts. */
export function buildSessionTranscript(messages: Message[]): string {
  const lines: string[] = [];
  let total = 0;

  for (const message of messages) {
    if (message.role === 'system') continue;
    const body = clip(messageBody(message), MAX_MESSAGE_CHARS);
    if (!body) continue;
    const line = `${message.role}: ${body}`;
    if (total + line.length + 2 > MAX_TRANSCRIPT_CHARS) {
      lines.push('…(transcript truncated)');
      break;
    }
    lines.push(line);
    total += line.length + 2;
  }

  return lines.join('\n\n');
}
