import { exec } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import Anthropic from '@anthropic-ai/sdk';
import type { InstructionDraft } from '@agent-orchestrator/shared';
import {
  buildInstructionDraftPrompt,
  parseInstructionDraftResponse,
  type InstructionDraftPromptInput,
} from './instruction-draft.js';

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
