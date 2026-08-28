import {
  AUTOMATION_POLL_MAX_SECONDS,
  AUTOMATION_POLL_MIN_SECONDS,
} from '@agent-orchestrator/shared';
import type { AppContext } from './app-context.js';
import {
  automationPollShouldRun,
  getAutomationSettings,
} from './automation-settings.js';
import { collectPollTargets } from './github-poll-targets.js';
import { handleAutomationEvents, isRateLimitError, pollTargetState } from './github-automation.js';

export interface PollBusOptions {
  /** Override sleep between polls (ms); tests pass 0. */
  tickMs?: (settings: ReturnType<typeof getAutomationSettings>) => number;
}

let pollTimer: ReturnType<typeof setTimeout> | null = null;
let pollRunning = false;
let backoffMultiplier = 1;

export function stopGithubPollBus(): void {
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
}

function scheduleNext(ctx: AppContext, delayMs: number, options: PollBusOptions): void {
  stopGithubPollBus();
  pollTimer = setTimeout(() => {
    void runPollCycle(ctx, options);
  }, delayMs);
  pollTimer.unref?.();
}

export function startGithubPollBus(ctx: AppContext, options: PollBusOptions = {}): void {
  stopGithubPollBus();
  scheduleNext(ctx, 5_000, options);
}

async function runTargets(ctx: AppContext): Promise<{ rateLimited: boolean }> {
  let rateLimited = false;
  try {
    const targets = await collectPollTargets(ctx);
    for (const target of targets) {
      try {
        const events = await pollTargetState(ctx, target);
        await handleAutomationEvents(ctx, target, events);
      } catch (error) {
        if (isRateLimitError(error)) {
          rateLimited = true;
          console.warn('[automation] GitHub rate limit hit; backing off');
          break;
        }
        console.warn(
          `[automation] poll failed for ${target.owner}/${target.repo}#${target.number}:`,
          error,
        );
      }
    }
    if (rateLimited) {
      backoffMultiplier = Math.min(backoffMultiplier * 2, 8);
    } else {
      backoffMultiplier = 1;
    }
  } catch (error) {
    console.warn('[automation] poll cycle failed:', error);
    if (isRateLimitError(error)) {
      rateLimited = true;
      backoffMultiplier = Math.min(backoffMultiplier * 2, 8);
    }
  }
  return { rateLimited };
}

function scheduleAfterCycle(
  ctx: AppContext,
  baseIntervalMs: number,
  rateLimited: boolean,
  options: PollBusOptions,
): void {
  const delay = Math.min(
    AUTOMATION_POLL_MAX_SECONDS * 1_000,
    Math.max(AUTOMATION_POLL_MIN_SECONDS * 1_000, baseIntervalMs * backoffMultiplier),
  );
  scheduleNext(ctx, rateLimited ? delay : baseIntervalMs * backoffMultiplier, options);
}

async function runPollCycle(ctx: AppContext, options: PollBusOptions): Promise<void> {
  if (pollRunning) {
    scheduleNext(ctx, 2_000, options);
    return;
  }

  const settings = getAutomationSettings(ctx);
  const baseIntervalMs =
    options.tickMs?.(settings) ??
    settings.pollIntervalSeconds * 1_000;

  if (!automationPollShouldRun(settings)) {
    scheduleNext(ctx, Math.max(baseIntervalMs, 30_000), options);
    return;
  }

  pollRunning = true;
  let rateLimited = false;
  try {
    ({ rateLimited } = await runTargets(ctx));
  } finally {
    pollRunning = false;
  }

  scheduleAfterCycle(ctx, baseIntervalMs, rateLimited, options);
}

export async function triggerGithubPollNow(
  ctx: AppContext,
  options: PollBusOptions = {},
): Promise<{ triggered: boolean }> {
  if (pollRunning) return { triggered: false };
  pollRunning = true;
  let rateLimited = false;
  try {
    ({ rateLimited } = await runTargets(ctx));
  } finally {
    pollRunning = false;
  }
  const settings = getAutomationSettings(ctx);
  const baseIntervalMs = options.tickMs?.(settings) ?? settings.pollIntervalSeconds * 1_000;
  scheduleAfterCycle(ctx, baseIntervalMs, rateLimited, options);
  return { triggered: true };
}

/** Test hook: run one poll cycle synchronously. */
export async function runGithubPollOnce(ctx: AppContext): Promise<void> {
  const targets = await collectPollTargets(ctx);
  for (const target of targets) {
    const events = await pollTargetState(ctx, target);
    await handleAutomationEvents(ctx, target, events);
  }
}
