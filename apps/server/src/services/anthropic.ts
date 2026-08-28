import { exec } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import Anthropic from '@anthropic-ai/sdk';
import {
  SESSION_GRADE_FINDING_CATEGORIES,
  type InstructionDraft,
  type SessionGradeAnalysis,
  type SessionGradeScore,
} from '@agent-orchestrator/shared';
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

const execAsync = promisify(exec);

interface ClaudeSettings {
  apiKeyHelper?: string;
  apiBaseUrl?: string;
}

interface AnthropicCredentials {
  apiKey: string;
  baseUrl?: string;
}

async function resolveCredentials(): Promise<AnthropicCredentials> {
  const claudeDir = path.join(os.homedir(), '.claude');
  const settingsPath = path.join(claudeDir, 'settings.json');
  const apiKeyPath = path.join(claudeDir, '.api_key');

  let settings: ClaudeSettings = {};
  try {
    const raw = await fs.readFile(settingsPath, 'utf-8');
    settings = JSON.parse(raw) as ClaudeSettings;
  } catch {
    // settings.json missing, unreadable, or invalid JSON — fall through to the API key file
  }

  if (settings.apiKeyHelper) {
    const { stdout } = await execAsync(settings.apiKeyHelper);
    const apiKey = stdout.trim();
    if (apiKey) {
      return { apiKey, baseUrl: settings.apiBaseUrl };
    }
  }

  try {
    const raw = await fs.readFile(apiKeyPath, 'utf-8');
    const apiKey = raw.trim();
    if (apiKey) {
      return { apiKey, baseUrl: settings.apiBaseUrl };
    }
  } catch {
    // .api_key missing or unreadable
  }

  throw new Error(
    `Unable to resolve an Anthropic API key. Configure "apiKeyHelper" in ${settingsPath} or create ${apiKeyPath}.`,
  );
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

export class AnthropicService {
  async suggestBranchName(idea: string): Promise<string> {
    const { apiKey, baseUrl } = await resolveCredentials();
    const client = new Anthropic({ apiKey, baseURL: baseUrl || undefined });

    const response = await client.messages.create({
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

  async suggestChatTitle(prompt: string): Promise<string> {
    const { apiKey, baseUrl } = await resolveCredentials();
    const client = new Anthropic({ apiKey, baseURL: baseUrl || undefined, timeout: 8_000 });
    const clipped = prompt.trim().slice(0, 2000) || 'The user sent an image.';

    const response = await client.messages.create({
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
    const { apiKey, baseUrl } = await resolveCredentials();
    const client = new Anthropic({ apiKey, baseURL: baseUrl || undefined });
    const { system, user } = buildCompactSummaryPrompt(input);

    const response = await client.messages.create({
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
    const { apiKey, baseUrl } = await resolveCredentials();
    const client = new Anthropic({ apiKey, baseURL: baseUrl || undefined });
    const { system, user } = buildSessionGradePrompt(input);

    const response = await client.messages.create({
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

  async generateInstructionDraft(input: InstructionDraftPromptInput): Promise<InstructionDraft> {
    const { apiKey, baseUrl } = await resolveCredentials();
    const client = new Anthropic({ apiKey, baseURL: baseUrl || undefined });
    const { system, user } = buildInstructionDraftPrompt(input);

    const response = await client.messages.create({
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
