import type { AssistantToolDefinition } from './assistant.js';

const confirmProp = {
  type: 'boolean' as const,
  description: 'Must be true to execute; ask the user first if unset/false',
};

const markdownFields = {
  name: { type: 'string', description: 'Display name / slug source' },
  description: { type: 'string', description: 'When-to-use summary' },
  content: { type: 'string', description: 'Markdown body (frontmatter optional)' },
};

export const ASSISTANT_BRAIN_TOOLS: AssistantToolDefinition[] = [
  {
    name: 'ask_user',
    description:
      'Ask the user steering questions with optional multiple-choice. Stops this turn until they answer in the UI. Use before proposing Brain drafts when required fields are missing.',
    risk: 'read',
    inputSchema: {
      type: 'object',
      properties: {
        questions: {
          type: 'array',
          description: 'One or more questions',
          items: {
            type: 'object',
            properties: {
              question: { type: 'string' },
              header: { type: 'string' },
              multiSelect: { type: 'boolean' },
              options: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    label: { type: 'string' },
                    description: { type: 'string' },
                  },
                  required: ['label'],
                  additionalProperties: false,
                },
              },
            },
            required: ['question'],
            additionalProperties: false,
          },
        },
      },
      required: ['questions'],
      additionalProperties: false,
    },
  },
  {
    name: 'propose_brain_draft',
    description:
      'Fill the Brain working pane with a suggested skill, personal subagent, kickoff task, or follow-up. Does not write files. The user edits and saves.',
    risk: 'read',
    inputSchema: {
      type: 'object',
      properties: {
        kind: {
          type: 'string',
          enum: ['skill', 'agent', 'task', 'follow-up'],
        },
        rationale: { type: 'string', description: 'Short why this draft' },
        slug: { type: 'string', description: 'Existing skill/agent slug when improving' },
        id: { type: 'string', description: 'Existing task or follow-up id when improving' },
        name: { type: 'string' },
        title: { type: 'string' },
        description: { type: 'string' },
        content: { type: 'string', description: 'Skill or agent markdown body' },
        purpose: { type: 'string' },
        promptTemplate: { type: 'string' },
        systemPrompt: { type: 'string' },
        allowedTools: { type: 'string' },
        model: { type: 'string' },
        effort: { type: 'string', enum: ['low', 'medium', 'high', 'xhigh', 'max'] },
        permissionMode: {
          type: 'string',
          enum: ['default', 'acceptEdits', 'plan', 'auto', 'dontAsk', 'bypassPermissions'],
        },
        listed: { type: 'boolean' },
        prompt: { type: 'string', description: 'Follow-up chip prompt' },
        kindValue: {
          type: 'string',
          enum: ['prompt', 'commit-and-push', 'start-template', 'grade-session'],
        },
        template: { type: 'string' },
        enabled: { type: 'boolean' },
      },
      required: ['kind'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_personal_skills',
    description: 'List personal skills in ~/.claude/skills (slug, name, description).',
    risk: 'read',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'get_personal_skill',
    description: 'Get one personal skill including SKILL.md content.',
    risk: 'read',
    inputSchema: {
      type: 'object',
      properties: { slug: { type: 'string' } },
      required: ['slug'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_personal_agents',
    description: 'List personal Claude Code subagents in ~/.claude/agents.',
    risk: 'read',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'get_personal_agent',
    description: 'Get one personal subagent including markdown content.',
    risk: 'read',
    inputSchema: {
      type: 'object',
      properties: { slug: { type: 'string' } },
      required: ['slug'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_task_followups',
    description: 'List Brain follow-up catalog entries (post-session chips).',
    risk: 'read',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'list_recent_session_grades',
    description: 'Recent graded chat sessions (score, comment, finding titles) for skill gardening.',
    risk: 'read',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'integer', minimum: 1, maximum: 40 },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'create_personal_skill',
    description: 'Write a personal skill to ~/.claude/skills. Prefer propose_brain_draft; requires confirm=true.',
    risk: 'write',
    inputSchema: {
      type: 'object',
      properties: { ...markdownFields, confirm: confirmProp },
      required: ['name', 'content', 'confirm'],
      additionalProperties: false,
    },
  },
  {
    name: 'update_personal_skill',
    description: 'Update a personal skill. Prefer propose_brain_draft; requires confirm=true.',
    risk: 'write',
    inputSchema: {
      type: 'object',
      properties: { slug: { type: 'string' }, ...markdownFields, confirm: confirmProp },
      required: ['slug', 'confirm'],
      additionalProperties: false,
    },
  },
  {
    name: 'create_personal_agent',
    description:
      'Write a personal Claude subagent to ~/.claude/agents. Prefer propose_brain_draft; requires confirm=true.',
    risk: 'write',
    inputSchema: {
      type: 'object',
      properties: { ...markdownFields, confirm: confirmProp },
      required: ['name', 'content', 'confirm'],
      additionalProperties: false,
    },
  },
  {
    name: 'update_personal_agent',
    description: 'Update a personal subagent. Prefer propose_brain_draft; requires confirm=true.',
    risk: 'write',
    inputSchema: {
      type: 'object',
      properties: { slug: { type: 'string' }, ...markdownFields, confirm: confirmProp },
      required: ['slug', 'confirm'],
      additionalProperties: false,
    },
  },
];
