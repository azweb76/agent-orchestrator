import type { SpendBudgetStatus, SpendCapBlockReason } from '@agent-orchestrator/shared';
import type { AppContext } from './app.js';
import { getAppSettings } from './app-settings.js';

export interface SpendCapEvaluation {
  reason: SpendCapBlockReason;
  message: string;
}

function startOfTodayMs(): number {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return start.getTime();
}

/** Today's spend per agent from persisted assistant turn costs. */
export function todayCostByAgent(ctx: AppContext): Map<string, number> {
  const todayMs = startOfTodayMs();
  const byAgent = new Map<string, number>();
  for (const row of ctx.repos.messages.listCostRows()) {
    if (!Number.isFinite(row.costUsd)) continue;
    if (Date.parse(row.createdAt) < todayMs) continue;
    byAgent.set(row.agentId, (byAgent.get(row.agentId) ?? 0) + row.costUsd);
  }
  return byAgent;
}

export function todayFleetCost(ctx: AppContext): number {
  let total = 0;
  for (const value of todayCostByAgent(ctx).values()) total += value;
  return Number(total.toFixed(4));
}

export function buildSpendBudgetStatus(ctx: AppContext): SpendBudgetStatus {
  const settings = getAppSettings(ctx.repos);
  const todayCostUsd = todayFleetCost(ctx);
  const byAgent = todayCostByAgent(ctx);
  const agentsAtCap: string[] = [];

  if (settings.perAgentSpendCapUsd != null) {
    for (const [agentId, cost] of byAgent) {
      if (cost >= settings.perAgentSpendCapUsd) agentsAtCap.push(agentId);
    }
  }

  const remainingDailyUsd =
    settings.dailySpendCapUsd == null
      ? null
      : Number(Math.max(0, settings.dailySpendCapUsd - todayCostUsd).toFixed(4));

  return {
    dailyCapUsd: settings.dailySpendCapUsd,
    perAgentCapUsd: settings.perAgentSpendCapUsd,
    todayCostUsd,
    remainingDailyUsd,
    agentsAtCap,
  };
}

/** Returns a block reason when a new run must not start; null when allowed. */
export function evaluateSpendCap(ctx: AppContext, agentId: string): SpendCapEvaluation | null {
  const settings = getAppSettings(ctx.repos);
  if (settings.dailySpendCapUsd == null && settings.perAgentSpendCapUsd == null) {
    return null;
  }

  const todayCostUsd = todayFleetCost(ctx);
  if (settings.dailySpendCapUsd != null && todayCostUsd >= settings.dailySpendCapUsd) {
    return {
      reason: 'daily_cap',
      message: `Daily spend cap of $${settings.dailySpendCapUsd.toFixed(2)} reached ($${todayCostUsd.toFixed(2)} today).`,
    };
  }

  if (settings.perAgentSpendCapUsd != null) {
    const agentToday = todayCostByAgent(ctx).get(agentId) ?? 0;
    if (agentToday >= settings.perAgentSpendCapUsd) {
      return {
        reason: 'per_agent_cap',
        message: `Per-agent spend cap of $${settings.perAgentSpendCapUsd.toFixed(2)} reached for this agent ($${agentToday.toFixed(2)} today).`,
      };
    }
  }

  return null;
}

export function spendCapBlockLabel(reason: SpendCapBlockReason): string {
  return reason === 'daily_cap' ? 'Daily spend cap' : 'Per-agent spend cap';
}
