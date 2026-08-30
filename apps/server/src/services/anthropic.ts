import { query, type Options } from '@anthropic-ai/claude-agent-sdk';
import type { InstructionDraft, SessionGradeAnalysis, SessionGradeScore } from '@agent-orchestrator/shared';
import {
  buildInstructionDraftPrompt,
  parseInstructionDraftResponse,
  type InstructionDraftPromptInput,
} from './instruction-draft.js';
import {
  buildSessionGradePrompt,
  parseSessionGradeResponse,
  type SessionGradeContext,
} from './session-grade.js';
import {
  buildCompactSummaryPrompt,
  parseCompactSummaryResponse,
  type CompactSummaryInput,
} from './compact-session.js';

const HAIKU_MODEL = 'claude-haiku-4-5-20251001';
const SONNET_MODEL = 'claude-sonnet-4-5-20250929';

interface OneShotInput {
  model: string;
  systemPrompt: string;
  prompt: string;
}

/**
 * Runs the local Claude Code CLI (via the Agent SDK) for a single text-only turn.
 * Reuses whatever credentials the CLI already has configured — OAuth (Claude
 * Pro/Max subscription login) included — instead of requiring a separate
 * Anthropic API key.
 */
export class AnthropicService {
  constructor(private claudeBin: string = process.env.CLAUDE_BIN?.trim() || 'claude') {}

  setBin(bin: string): void {
    this.claudeBin = bin;
  }

  private async runOneShot(input: OneShotInput): Promise<string> {
    const options: Options = {
      model: input.model,
      systemPrompt: input.systemPrompt,
      maxTurns: 1,
      tools: [],
      pathToClaudeCodeExecutable: this.claudeBin,
    };

    for await (const message of query({ prompt: input.prompt, options })) {
      if (message.type !== 'result') continue;
      if (message.subtype !== 'success') {
        throw new Error(`Claude query failed: ${message.subtype}`);
      }
      return message.result;
    }

    throw new Error('Claude query returned no result');
  }

  async suggestBranchName(idea: string): Promise<string> {
    const text = await this.runOneShot({
      model: HAIKU_MODEL,
      systemPrompt:
        'You turn a short feature idea into a git branch name. Respond with ONLY the branch name slug: ' +
        'lowercase, words separated by hyphens, optionally with a conventional prefix like "feature/" or ' +
        '"fix/" if it fits the idea. Do not include any explanation, quoting, or punctuation other than ' +
        'hyphens and slashes.',
      prompt: idea,
    });

    return sanitizeBranchName(text);
  }

  async suggestChatTitle(prompt: string): Promise<string> {
    const clipped = prompt.trim().slice(0, 2000) || 'The user sent an image.';
    const text = await this.runOneShot({
      model: HAIKU_MODEL,
      systemPrompt:
        "You name a chat session from the user's first message. " +
        'Respond with ONLY a short title: 2 to 6 words, Title Case, no quotes, no trailing punctuation. ' +
        'Capture the intent; do not copy the prompt verbatim unless it is already a short name.',
      prompt: clipped,
    });

    return sanitizeChatTitle(text, prompt);
  }

  /** Continuation summary for compact-and-continue (seeds the fresh session). */
  async summarizeSessionForContinuation(input: CompactSummaryInput): Promise<string> {
    const { system, user } = buildCompactSummaryPrompt(input);
    const text = await this.runOneShot({ model: SONNET_MODEL, systemPrompt: system, prompt: user });
    return parseCompactSummaryResponse(text);
  }

  async analyzeSessionGrade(
    input: SessionGradeContext,
  ): Promise<SessionGradeAnalysis & { score: SessionGradeScore }> {
    const { system, user } = buildSessionGradePrompt(input);
    const text = await this.runOneShot({ model: SONNET_MODEL, systemPrompt: system, prompt: user });
    return parseSessionGradeResponse(text, input.stats);
  }

  async generateInstructionDraft(input: InstructionDraftPromptInput): Promise<InstructionDraft> {
    const { system, user } = buildInstructionDraftPrompt(input);
    const text = await this.runOneShot({ model: SONNET_MODEL, systemPrompt: system, prompt: user });

    return parseInstructionDraftResponse(
      text,
      input.request,
      Boolean(input.existingContent && input.existingContent.trim()),
    );
  }
}

export function sanitizeBranchName(input: string): string {
  const fallback = 'idea-branch';
  if (typeof input !== 'string') return fallback;

  let slug = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9/-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/\/{2,}/g, '/')
    .replace(/^[-/]+|[-/]+$/g, '')
    .slice(0, 50)
    .replace(/[-/]+$/g, '');

  if (!slug) {
    const words = input.toLowerCase().match(/[a-z0-9]+/g);
    if (words && words.length > 0) {
      slug = words.slice(0, 5).join('-').slice(0, 50);
    }
  }

  return slug || fallback;
}

const AUTO_CHAT_TITLE_MAX_LENGTH = 60;

/** First-few-words fallback when the model is unavailable or returns nothing useful. */
export function fallbackTitleFromPrompt(prompt: string): string {
  const words = prompt
    .replace(/[\r\n]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 6);
  const title = words.join(' ').replace(/[.!?]+$/g, '').trim();
  if (!title) return 'Chat';
  return title.length <= AUTO_CHAT_TITLE_MAX_LENGTH
    ? title
    : title.slice(0, AUTO_CHAT_TITLE_MAX_LENGTH).trim();
}

export function sanitizeChatTitle(input: string, fallbackPrompt = ''): string {
  if (typeof input !== 'string') return fallbackTitleFromPrompt(fallbackPrompt);

  const cleaned = input
    .replace(/[\r\n]+/g, ' ')
    .replace(/^[\s"'`“”‘’]+|[\s"'`“”‘’]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.!?]+$/g, '')
    .trim();

  if (!cleaned) return fallbackTitleFromPrompt(fallbackPrompt);
  if (cleaned.length <= AUTO_CHAT_TITLE_MAX_LENGTH) return cleaned;
  return cleaned.slice(0, AUTO_CHAT_TITLE_MAX_LENGTH).trim();
}
