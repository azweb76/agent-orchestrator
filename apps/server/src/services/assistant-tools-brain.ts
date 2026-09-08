import { z } from 'zod';
import { parseBrainDraft, parseAskUserToolQuestions } from '@agent-orchestrator/shared';
import type { AppContext } from './app-context.js';
import {
  createPersonalAgent,
  getPersonalAgent,
  listPersonalAgents,
  updatePersonalAgent,
} from './personal-agents.js';
import {
  createPersonalSkill,
  getPersonalSkill,
  listPersonalSkills,
  updatePersonalSkill,
} from './personal-skills.js';
import { listTaskFollowUps } from './task-followups.js';

export type BrainToolResult = {
  content: string;
  isError?: boolean;
  awaitingUser?: boolean;
};

type ConfirmFn = (confirm: boolean | undefined, toolName: string) => void;

const askUserSchema = z.object({
  questions: z.array(z.unknown()).min(1).max(8),
});

export async function handleBrainAssistantTool(
  ctx: AppContext,
  name: string,
  input: Record<string, unknown>,
  requireConfirm: ConfirmFn,
): Promise<BrainToolResult | null> {
  switch (name) {
    case 'ask_user': {
      const body = askUserSchema.parse(input);
      const questions = parseAskUserToolQuestions(body.questions);
      if (questions.length === 0) {
        return { content: JSON.stringify({ error: 'No valid questions' }), isError: true };
      }
      return {
        content: JSON.stringify({ awaitingUser: true, questions }),
        awaitingUser: true,
      };
    }
    case 'propose_brain_draft': {
      const draft = parseBrainDraft(input);
      if (!draft) {
        return { content: JSON.stringify({ error: 'Invalid Brain draft' }), isError: true };
      }
      return { content: JSON.stringify({ ok: true, draft }) };
    }
    case 'list_personal_skills': {
      const skills = await listPersonalSkills();
      return {
        content: JSON.stringify(
          skills.map((skill) => ({
            slug: skill.slug,
            name: skill.name,
            description: skill.description,
          })),
        ),
      };
    }
    case 'get_personal_skill': {
      const slug = z.string().min(1).parse(input.slug);
      const skill = await getPersonalSkill(slug);
      return { content: JSON.stringify(skill) };
    }
    case 'list_personal_agents': {
      const agents = await listPersonalAgents();
      return {
        content: JSON.stringify(
          agents.map((agent) => ({
            slug: agent.slug,
            name: agent.name,
            description: agent.description,
          })),
        ),
      };
    }
    case 'get_personal_agent': {
      const slug = z.string().min(1).parse(input.slug);
      const agent = await getPersonalAgent(slug);
      return { content: JSON.stringify(agent) };
    }
    case 'list_task_followups': {
      const followUps = listTaskFollowUps(ctx);
      return {
        content: JSON.stringify(
          followUps.map((item) => ({
            id: item.id,
            name: item.name,
            title: item.title,
            description: item.description,
            kind: item.kind,
            enabled: item.enabled,
            builtIn: item.builtIn,
          })),
        ),
      };
    }
    case 'list_recent_session_grades': {
      const limit = z.number().int().min(1).max(40).optional().parse(input.limit) ?? 20;
      const sessions = ctx.repos.sessions.listRecentlyGraded(limit);
      return {
        content: JSON.stringify(
          sessions.map((session) => ({
            id: session.id,
            agentId: session.agentId,
            title: session.title,
            template: session.template,
            score: session.grade?.score ?? null,
            comment: session.grade?.comment ?? '',
            findingTitles: (session.grade?.analysis?.findings ?? []).map((finding) => finding.title),
          })),
        ),
      };
    }
    case 'create_personal_skill': {
      requireConfirm(input.confirm === true, name);
      const created = await createPersonalSkill({
        name: z.string().min(1).parse(input.name),
        description: typeof input.description === 'string' ? input.description : '',
        content: z.string().min(1).parse(input.content),
      });
      return { content: JSON.stringify({ ok: true, slug: created.slug }) };
    }
    case 'update_personal_skill': {
      requireConfirm(input.confirm === true, name);
      const slug = z.string().min(1).parse(input.slug);
      const updated = await updatePersonalSkill(slug, {
        name: typeof input.name === 'string' ? input.name : undefined,
        description: typeof input.description === 'string' ? input.description : undefined,
        content: typeof input.content === 'string' ? input.content : undefined,
      });
      return { content: JSON.stringify({ ok: true, slug: updated.slug }) };
    }
    case 'create_personal_agent': {
      requireConfirm(input.confirm === true, name);
      const created = await createPersonalAgent({
        name: z.string().min(1).parse(input.name),
        description: typeof input.description === 'string' ? input.description : '',
        content: z.string().min(1).parse(input.content),
      });
      return { content: JSON.stringify({ ok: true, slug: created.slug }) };
    }
    case 'update_personal_agent': {
      requireConfirm(input.confirm === true, name);
      const slug = z.string().min(1).parse(input.slug);
      const updated = await updatePersonalAgent(slug, {
        name: typeof input.name === 'string' ? input.name : undefined,
        description: typeof input.description === 'string' ? input.description : undefined,
        content: typeof input.content === 'string' ? input.content : undefined,
      });
      return { content: JSON.stringify({ ok: true, slug: updated.slug }) };
    }
    default:
      return null;
  }
}
