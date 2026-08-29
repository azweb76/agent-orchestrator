import { v4 as uuidv4 } from 'uuid';
import type {
  CreateSessionProfileRequest,
  SessionProfile,
  UpdateSessionProfileRequest,
} from '@agent-orchestrator/shared';
import {
  defaultFromGoalProfile,
  FROM_GOAL_PROFILE_NAME,
  isValidSessionProfileName,
  sanitizeProfileAllowedTools,
} from '@agent-orchestrator/shared';
import { type AppContext, nowIso } from './app-context.js';

export function listSessionProfiles(ctx: AppContext): SessionProfile[] {
  return ctx.repos.sessionProfiles.list();
}

export function getSessionProfile(ctx: AppContext, id: string): SessionProfile {
  const profile = ctx.repos.sessionProfiles.getById(id);
  if (!profile) throw new Error('Session profile not found');
  return profile;
}

export function requireSessionProfileByName(ctx: AppContext, name: string): SessionProfile {
  const profile = ctx.repos.sessionProfiles.getByName(name.trim());
  if (!profile) throw new Error(`Session profile "${name}" not found`);
  return profile;
}

/** Ensure the built-in From goal profile exists (idempotent). */
export function ensureFromGoalProfile(ctx: AppContext): SessionProfile {
  const existing = ctx.repos.sessionProfiles.getByName(FROM_GOAL_PROFILE_NAME);
  if (existing) return existing;
  const now = nowIso();
  const seed = defaultFromGoalProfile();
  return ctx.repos.sessionProfiles.create({
    id: uuidv4(),
    ...seed,
    createdAt: now,
    updatedAt: now,
  });
}

function normalizeOptionalText(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function createSessionProfile(
  ctx: AppContext,
  body: CreateSessionProfileRequest,
): SessionProfile {
  const name = body.name.trim().toLowerCase();
  if (!isValidSessionProfileName(name)) {
    throw new Error('Profile name must be a lowercase slug (a-z, 0-9, hyphens)');
  }
  if (ctx.repos.sessionProfiles.getByName(name)) {
    throw new Error(`A profile named "${name}" already exists`);
  }
  const title = body.title.trim();
  if (!title) throw new Error('Title is required');

  const now = nowIso();
  return ctx.repos.sessionProfiles.create({
    id: uuidv4(),
    name,
    title,
    description: body.description?.trim() ?? '',
    promptTemplate: normalizeOptionalText(body.promptTemplate),
    systemPrompt: normalizeOptionalText(body.systemPrompt),
    allowedTools: sanitizeProfileAllowedTools(body.allowedTools),
    model: body.model?.trim() || 'sonnet',
    effort: body.effort ?? 'high',
    permissionMode: body.permissionMode ?? 'plan',
    listed: body.listed ?? false,
    builtIn: false,
    createdAt: now,
    updatedAt: now,
  });
}

export function updateSessionProfile(
  ctx: AppContext,
  id: string,
  body: UpdateSessionProfileRequest,
): SessionProfile {
  const current = getSessionProfile(ctx, id);
  let name = current.name;
  if (body.name != null && !current.builtIn) {
    const next = body.name.trim().toLowerCase();
    if (!isValidSessionProfileName(next)) {
      throw new Error('Profile name must be a lowercase slug (a-z, 0-9, hyphens)');
    }
    const conflict = ctx.repos.sessionProfiles.getByName(next);
    if (conflict && conflict.id !== id) {
      throw new Error(`A profile named "${next}" already exists`);
    }
    name = next;
  }

  const title = body.title != null ? body.title.trim() : current.title;
  if (!title) throw new Error('Title is required');

  return ctx.repos.sessionProfiles.update({
    ...current,
    name,
    title,
    description: body.description != null ? body.description.trim() : current.description,
    promptTemplate:
      body.promptTemplate !== undefined
        ? normalizeOptionalText(body.promptTemplate)
        : current.promptTemplate,
    systemPrompt:
      body.systemPrompt !== undefined
        ? normalizeOptionalText(body.systemPrompt)
        : current.systemPrompt,
    allowedTools:
      body.allowedTools !== undefined
        ? sanitizeProfileAllowedTools(body.allowedTools)
        : current.allowedTools,
    model: body.model?.trim() || current.model,
    effort: body.effort ?? current.effort,
    permissionMode: body.permissionMode ?? current.permissionMode,
    listed: body.listed ?? current.listed,
    updatedAt: nowIso(),
  });
}

export function deleteSessionProfile(ctx: AppContext, id: string): void {
  const profile = getSessionProfile(ctx, id);
  if (profile.builtIn) {
    throw new Error(`Built-in profile "${profile.name}" cannot be deleted`);
  }
  ctx.repos.sessionProfiles.delete(id);
}
