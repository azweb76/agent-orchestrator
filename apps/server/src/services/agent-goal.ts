import fs from 'node:fs/promises';
import path from 'node:path';
import type { Agent } from '@agent-orchestrator/shared';
import type { AppContext } from './app-context.js';

export const AGENT_GOAL_FILENAME = 'GOAL.md';

export function agentGoalFilePath(dataDir: string, agentId: string): string {
  return path.join(dataDir, 'agents', agentId, AGENT_GOAL_FILENAME);
}

export function agentHasGoal(agent: Pick<Agent, 'goal'>): boolean {
  return Boolean(agent.goal.trim());
}

export function requireAgentGoal(agent: Pick<Agent, 'goal'>): void {
  if (!agentHasGoal(agent)) {
    throw new Error('Set a goal on the Goal tab before starting work');
  }
}

export async function syncAgentGoalFile(
  ctx: Pick<AppContext, 'dataDir'>,
  agent: Pick<Agent, 'id' | 'goal'>,
): Promise<string | null> {
  const filePath = agentGoalFilePath(ctx.dataDir, agent.id);
  const goal = agent.goal.trim();
  if (!goal) {
    await fs.rm(filePath, { force: true });
    return null;
  }
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${goal}\n`, 'utf8');
  return filePath;
}

export async function ensureAgentGoalFile(
  ctx: Pick<AppContext, 'dataDir'>,
  agent: Pick<Agent, 'id' | 'goal'>,
): Promise<string | null> {
  if (!agentHasGoal(agent)) return null;
  const filePath = agentGoalFilePath(ctx.dataDir, agent.id);
  try {
    await fs.access(filePath);
    return filePath;
  } catch {
    return syncAgentGoalFile(ctx, agent);
  }
}

export function goalPathForAgent(
  ctx: Pick<AppContext, 'dataDir'>,
  agent: Pick<Agent, 'id' | 'goal'>,
): string | null {
  return agentHasGoal(agent) ? agentGoalFilePath(ctx.dataDir, agent.id) : null;
}
