import {
  stripMarkdownFrontmatter,
  type AgentTask,
  type BrainDraft,
  type BrainMarkdownDraft,
  type PersonalAgent,
  type PersonalSkill,
  type TaskFollowUp,
} from '@agent-orchestrator/shared';

/**
 * Pure library-row to copilot-draft mappers. Kept free of `api/client` so they can be
 * unit-tested in the node test environment.
 */

export function skillToDraft(skill: PersonalSkill): BrainMarkdownDraft {
  return {
    kind: 'skill',
    slug: skill.slug,
    name: skill.name,
    description: skill.description,
    content: stripMarkdownFrontmatter(skill.content),
  };
}

export function agentToDraft(agent: PersonalAgent): BrainMarkdownDraft {
  return {
    kind: 'agent',
    slug: agent.slug,
    name: agent.name,
    description: agent.description,
    content: stripMarkdownFrontmatter(agent.content),
  };
}

export function taskToDraft(task: AgentTask): BrainDraft {
  return {
    kind: 'task',
    id: task.id,
    name: task.name,
    title: task.title,
    description: task.description,
    purpose: task.purpose,
    promptTemplate: task.promptTemplate ?? '',
    systemPrompt: task.systemPrompt ?? '',
    allowedTools: task.allowedTools ?? '',
    model: task.model,
    effort: task.effort,
    permissionMode: task.permissionMode,
    listed: task.listed,
  };
}

export function followUpToDraft(followUp: TaskFollowUp): BrainDraft {
  return {
    kind: 'follow-up',
    id: followUp.id,
    name: followUp.name,
    title: followUp.title,
    description: followUp.description,
    prompt: followUp.prompt,
    kindValue: followUp.kind,
    template: followUp.template ?? '',
    enabled: followUp.enabled,
  };
}
