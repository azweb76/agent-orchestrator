import Anthropic from '@anthropic-ai/sdk';
import {
  SESSION_GRADE_FINDING_CATEGORIES,
  type InstructionDraft,
  type SessionGradeAnalysis,
  type SessionGradeScore,
  type TaskSuggestion,
} from '@agent-orchestrator/shared';
import { createAnthropicClient, resolveAnthropicAuth } from './anthropic-credentials.js';
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
  buildTaskSuggestionsPrompt,
  parseTaskSuggestionsResponse,
  type TaskSuggestionsContext,
} from './task-suggestions.js';
import {
  buildCompactSummaryPrompt,
  parseCompactSummaryResponse,
  type CompactSummaryInput,
} from './compact-session.js';

async function client(options: { timeout?: number } = {}): Promise<Anthropic> {
  return createAnthropicClient(await resolveAnthropicAuth(), options);
}

const SESSION_GRADE_TOOL: Anthropic.Tool = {
  name: 'submit_session_grade',
  description: 'Submit the completed session grade analysis as a JSON object.',
  input_schema: {
    type: 'object',
    properties: {
      score: {
        type: 'integer',
        description: 'Overall score from 1 (poor) to 5 (efficient).',
        minimum: 1,
        maximum: 5,
      },
      summary: {
        type: 'string',
        description: '2-4 sentence overall summary.',
      },
      findings: {
        type: 'array',
        description: 'Exactly one finding for each analysis category.',
        items: {
          type: 'object',
          properties: {
            category: {
              type: 'string',
              enum: [...SESSION_GRADE_FINDING_CATEGORIES],
            },
            severity: {
              type: 'string',
              enum: ['ok', 'warning', 'issue'],
            },
            title: { type: 'string' },
            detail: { type: 'string' },
          },
          required: ['category', 'severity', 'title', 'detail'],
        },
      },
    },
    required: ['score', 'summary', 'findings'],
  },
};

const TASK_SUGGESTIONS_TOOL: Anthropic.Tool = {
  name: 'submit_task_suggestions',
  description: 'Submit 2-4 concrete follow-up tasks for this finished session.',
  input_schema: {
    type: 'object',
    properties: {
      suggestions: {
        type: 'array',
        minItems: 2,
        maxItems: 4,
        items: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            prompt: { type: 'string' },
          },
          required: ['title', 'prompt'],
        },
      },
    },
    required: ['suggestions'],
  },
};

export class AnthropicService {
  async suggestBranchName(idea: string): Promise<string> {
    const anthropic = await client();

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 30,
      system:
        'You turn a short feature idea into a git branch name. Respond with ONLY the branch name slug: ' +
        'lowercase, words separated by hyphens, optionally with a conventional prefix like "feature/" or ' +
        '"fix/" if it fits the idea. Do not include any explanation, quoting, or punctuation other than ' +
        'hyphens and slashes.',
      messages: [{ role: 'user', content: idea }],
    });

    const text = response.content
      .map((block) => (block.type === 'text' ? block.text : ''))
      .join('');

    return sanitizeBranchName(text);
  }

  /**
   * Pick an agent task slug for a goal from candidates with non-empty purpose.
   * Returns the matching candidate `name`, or `null` when none fit.
   */
  async selectAgentTaskForGoal(
    goal: string,
    candidates: Array<{ name: string; title: string; purpose: string }>,
  ): Promise<string | null> {
    if (candidates.length === 0) return null;
    const anthropic = await client();
    const catalog = candidates
      .map(
        (item, index) =>
          `${index + 1}. slug=${item.name}\ntitle=${item.title}\npurpose=${item.purpose}`,
      )
      .join('\n\n');

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 40,
      system:
        'You match a user goal to exactly one agent task. ' +
        'Respond with ONLY the task slug from the catalog, or NONE if no task purpose fits. ' +
        'Do not invent slugs. No explanation.',
      messages: [
        {
          role: 'user',
          content: `Goal:\n${goal.trim()}\n\nTasks:\n${catalog}`,
        },
      ],
    });

    const text = response.content
      .map((block) => (block.type === 'text' ? block.text : ''))
      .join('');

    return sanitizeAgentTaskSelection(text, candidates.map((item) => item.name));
  }

  async suggestChatTitle(prompt: string): Promise<string> {
    const anthropic = await client({ timeout: 8_000 });
    const clipped = prompt.trim().slice(0, 2000) || 'The user sent an image.';

    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 40,
      system:
        "You name a chat session from the user's first message. " +
        'Respond with ONLY a short title: 2 to 6 words, Title Case, no quotes, no trailing punctuation. ' +
        'Capture the intent; do not copy the prompt verbatim unless it is already a short name.',
      messages: [{ role: 'user', content: clipped }],
    });

    const text = response.content
      .map((block) => (block.type === 'text' ? block.text : ''))
      .join('');

    return sanitizeChatTitle(text, prompt);
  }

  /** Continuation summary for compact-and-continue (seeds the fresh session). */
  async summarizeSessionForContinuation(input: CompactSummaryInput): Promise<string> {
    const anthropic = await client();
    const { system, user } = buildCompactSummaryPrompt(input);

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 4000,
      system,
      messages: [{ role: 'user', content: user }],
    });

    const text = response.content
      .map((block) => (block.type === 'text' ? block.text : ''))
      .join('');

    return parseCompactSummaryResponse(text);
  }

  async analyzeSessionGrade(
    input: SessionGradeContext,
  ): Promise<SessionGradeAnalysis & { score: SessionGradeScore }> {
    const anthropic = await client();
    const { system, user } = buildSessionGradePrompt(input);

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 4000,
      system,
      messages: [{ role: 'user', content: user }],
      tools: [SESSION_GRADE_TOOL],
      tool_choice: { type: 'tool', name: SESSION_GRADE_TOOL.name },
    });

    const toolBlock = response.content.find((block) => block.type === 'tool_use');
    if (toolBlock && toolBlock.type === 'tool_use') {
      return parseSessionGradeResponse(toolBlock.input, input.stats);
    }

    const text = response.content
      .map((block) => (block.type === 'text' ? block.text : ''))
      .join('');

    return parseSessionGradeResponse(text, input.stats);
  }

  async generateTaskSuggestions(input: TaskSuggestionsContext): Promise<TaskSuggestion[]> {
    const anthropic = await client();
    const { system, user } = buildTaskSuggestionsPrompt(input);

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 1500,
      system,
      messages: [{ role: 'user', content: user }],
      tools: [TASK_SUGGESTIONS_TOOL],
      tool_choice: { type: 'tool', name: TASK_SUGGESTIONS_TOOL.name },
    });

    const toolBlock = response.content.find((block) => block.type === 'tool_use');
    if (toolBlock && toolBlock.type === 'tool_use') {
      return parseTaskSuggestionsResponse(toolBlock.input);
    }

    const text = response.content
      .map((block) => (block.type === 'text' ? block.text : ''))
      .join('');

    return parseTaskSuggestionsResponse(text);
  }

  async generateInstructionDraft(input: InstructionDraftPromptInput): Promise<InstructionDraft> {
    const anthropic = await client();
    const { system, user } = buildInstructionDraftPrompt(input);

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 4000,
      system,
      messages: [{ role: 'user', content: user }],
    });

    const text = response.content
      .map((block) => (block.type === 'text' ? block.text : ''))
      .join('');

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

/** Parse model output to a candidate task slug, or null for NONE / invalid. */
export function sanitizeAgentTaskSelection(
  input: string,
  candidateNames: string[],
): string | null {
  if (typeof input !== 'string') return null;
  const cleaned = input
    .replace(/[\r\n]+/g, ' ')
    .replace(/^[\s"'`]+|[\s"'`]+$/g, '')
    .trim()
    .toLowerCase();
  if (!cleaned || cleaned === 'none') return null;
  const firstToken = cleaned.split(/\s+/)[0] ?? '';
  const allowed = new Set(candidateNames.map((name) => name.toLowerCase()));
  if (allowed.has(firstToken)) {
    return candidateNames.find((name) => name.toLowerCase() === firstToken) ?? null;
  }
  return null;
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
