import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Box, Stack } from '@mui/material';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  brainCreatePrompt,
  brainImprovePrompt,
  emptyBrainDraft,
  latestBrainDraftFromMessages,
  mergeBrainDraft,
  stripMarkdownFrontmatter,
  type AgentTask,
  type BrainDraft,
  type BrainDraftKind,
  type PersonalAgent,
  type PersonalSkill,
  type TaskFollowUp,
} from '@agent-orchestrator/shared';
import { api } from '../../api/client';
import { BrainCopilot } from './BrainCopilot';
import { BrainDraftEditor } from './BrainDraftEditor';
import type { BrainTab } from './brainTabs';

function tabToKind(tab: BrainTab): BrainDraftKind {
  if (tab === 'agents') return 'agent';
  if (tab === 'tasks') return 'task';
  if (tab === 'follow-ups') return 'follow-up';
  return 'skill';
}

function skillToDraft(skill: PersonalSkill): BrainDraft {
  return {
    kind: 'skill',
    slug: skill.slug,
    name: skill.name,
    description: skill.description,
    content: stripMarkdownFrontmatter(skill.content),
  };
}

function agentToDraft(agent: PersonalAgent): BrainDraft {
  return {
    kind: 'agent',
    slug: agent.slug,
    name: agent.name,
    description: agent.description,
    content: stripMarkdownFrontmatter(agent.content),
  };
}

function taskToDraft(task: AgentTask): BrainDraft {
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

function followUpToDraft(followUp: TaskFollowUp): BrainDraft {
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

export function BrainWorkspace({
  tab,
  onTabKind,
  children,
}: {
  tab: BrainTab;
  onTabKind: (kind: BrainDraftKind) => void;
  children: (api: {
    selectedKey: string | null;
    onNew: () => void;
    onSelectSkill: (skill: PersonalSkill) => void;
    onImproveSkill: (skill: PersonalSkill) => void;
    onSelectAgent: (agent: PersonalAgent) => void;
    onImproveAgent: (agent: PersonalAgent) => void;
    onSelectTask: (task: AgentTask) => void;
    onImproveTask: (task: AgentTask) => void;
    onSelectFollowUp: (followUp: TaskFollowUp) => void;
    onImproveFollowUp: (followUp: TaskFollowUp) => void;
  }) => ReactNode;
}) {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const kind = tabToKind(tab);
  const [draft, setDraft] = useState<BrainDraft>(() => emptyBrainDraft(kind));
  const [dirtyKeys, setDirtyKeys] = useState<Set<string>>(() => new Set());
  const dirtyRef = useRef(dirtyKeys);
  dirtyRef.current = dirtyKeys;
  const [appliedToolId, setAppliedToolId] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [pendingSend, setPendingSend] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const messagesQuery = useQuery({
    queryKey: ['assistant', 'messages'],
    queryFn: () => api.getAssistantMessages(),
  });
  const messages = messagesQuery.data?.messages ?? [];

  useEffect(() => {
    const last = [...messages].reverse().find(
      (msg) => msg.role === 'tool' && msg.toolResult?.toolName === 'propose_brain_draft' && !msg.toolResult.isError,
    );
    if (!last || last.id === appliedToolId) return;
    const proposed = latestBrainDraftFromMessages(messages);
    if (!proposed) return;
    setAppliedToolId(last.id);
    setDraft((prev) => mergeBrainDraft(prev, proposed, dirtyRef.current));
    if (dirtyRef.current.size === 0) onTabKind(proposed.kind);
  }, [appliedToolId, messages, onTabKind]);

  useEffect(() => {
    setDraft((prev) => (prev.kind === kind ? prev : emptyBrainDraft(kind)));
    setDirtyKeys(new Set());
    setSaveError(null);
  }, [kind]);

  const selectedKey = useMemo(() => {
    if (draft.kind === 'skill' || draft.kind === 'agent') return draft.slug ?? null;
    if (draft.kind === 'task' || draft.kind === 'follow-up') return draft.id ?? null;
    return null;
  }, [draft]);

  const markDirty = (key: string) => {
    setDirtyKeys((prev) => new Set(prev).add(key));
  };

  const beginCreate = () => {
    setDraft(emptyBrainDraft(kind));
    setDirtyKeys(new Set());
    setSaveError(null);
    setPendingSend(brainCreatePrompt(kind));
  };

  useEffect(() => {
    if (searchParams.get('new') !== '1') return;
    beginCreate();
    const next = new URLSearchParams(searchParams);
    next.delete('new');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const tasksQuery = useQuery({ queryKey: ['agent-tasks'], queryFn: api.listAgentTasks });
  const followUpsQuery = useQuery({ queryKey: ['task-followups'], queryFn: api.listTaskFollowUps });
  const editingTask = draft.kind === 'task' ? tasksQuery.data?.find((item) => item.id === draft.id) : undefined;
  const editingFollowUp =
    draft.kind === 'follow-up' ? followUpsQuery.data?.find((item) => item.id === draft.id) : undefined;

  const saveMutation = useMutation({
    mutationFn: async () => {
      setSaveError(null);
      if (draft.kind === 'skill') {
        const body = {
          name: draft.name.trim(),
          description: draft.description.trim(),
          content: draft.content.trim(),
        };
        if (draft.slug) return api.updatePersonalSkill(draft.slug, body);
        return api.createPersonalSkill(body);
      }
      if (draft.kind === 'agent') {
        const body = {
          name: draft.name.trim(),
          description: draft.description.trim(),
          content: draft.content.trim(),
        };
        if (draft.slug) return api.updatePersonalAgent(draft.slug, body);
        return api.createPersonalAgent(body);
      }
      if (draft.kind === 'task') {
        const body = {
          name: draft.name.trim(),
          title: draft.title.trim(),
          description: draft.description.trim(),
          purpose: draft.purpose.trim(),
          promptTemplate: draft.promptTemplate.trim() || null,
          systemPrompt: draft.systemPrompt.trim() || null,
          allowedTools: draft.allowedTools.trim() || null,
          model: draft.model,
          effort: draft.effort,
          permissionMode: draft.permissionMode,
          listed: draft.listed,
        };
        if (draft.id) {
          const { name: _name, ...rest } = body;
          return api.updateAgentTask(draft.id, editingTask?.builtIn ? rest : body);
        }
        return api.createAgentTask(body);
      }
      if (draft.kind !== 'follow-up') throw new Error('Unsupported draft');
      const body = {
        name: draft.name.trim(),
        title: draft.title.trim(),
        description: draft.description.trim(),
        prompt: draft.prompt.trim(),
        kind: draft.kindValue,
        template: draft.kindValue === 'start-template' ? draft.template || null : null,
        enabled: draft.enabled,
      };
      if (draft.id) {
        const { name: _name, ...rest } = body;
        return api.updateTaskFollowUp(draft.id, editingFollowUp?.builtIn ? rest : body);
      }
      return api.createTaskFollowUp(body);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['personal-skills'] }),
        queryClient.invalidateQueries({ queryKey: ['personal-agents'] }),
        queryClient.invalidateQueries({ queryKey: ['agent-tasks'] }),
        queryClient.invalidateQueries({ queryKey: ['task-followups'] }),
        queryClient.invalidateQueries({ queryKey: ['brain-sync'] }),
      ]);
      setDirtyKeys(new Set());
    },
    onError: (error) => {
      setSaveError(error instanceof Error ? error.message : String(error));
    },
  });

  const listApi = {
    selectedKey,
    onNew: beginCreate,
    onSelectSkill: (skill: PersonalSkill) => {
      setDraft(skillToDraft(skill));
      setDirtyKeys(new Set());
      setSaveError(null);
    },
    onImproveSkill: (skill: PersonalSkill) => {
      setDraft(skillToDraft(skill));
      setDirtyKeys(new Set());
      setPendingSend(brainImprovePrompt('skill', skill.slug));
    },
    onSelectAgent: (agent: PersonalAgent) => {
      setDraft(agentToDraft(agent));
      setDirtyKeys(new Set());
      setSaveError(null);
    },
    onImproveAgent: (agent: PersonalAgent) => {
      setDraft(agentToDraft(agent));
      setDirtyKeys(new Set());
      setPendingSend(brainImprovePrompt('agent', agent.slug));
    },
    onSelectTask: (task: AgentTask) => {
      setDraft(taskToDraft(task));
      setDirtyKeys(new Set());
      setSaveError(null);
    },
    onImproveTask: (task: AgentTask) => {
      setDraft(taskToDraft(task));
      setDirtyKeys(new Set());
      setPendingSend(brainImprovePrompt('task', task.name));
    },
    onSelectFollowUp: (followUp: TaskFollowUp) => {
      setDraft(followUpToDraft(followUp));
      setDirtyKeys(new Set());
      setSaveError(null);
    },
    onImproveFollowUp: (followUp: TaskFollowUp) => {
      setDraft(followUpToDraft(followUp));
      setDirtyKeys(new Set());
      setPendingSend(brainImprovePrompt('follow-up', followUp.name));
    },
  };

  return (
    <Stack
      direction={{ xs: 'column', md: 'row' }}
      spacing={2.5}
      sx={{ alignItems: 'stretch', minHeight: { md: 640 } }}
    >
      <Box sx={{ flex: 1.1, minWidth: 0 }}>{children(listApi)}</Box>
      <Stack spacing={2.5} sx={{ flex: 1, minWidth: 0 }}>
        <BrainCopilot
          kind={kind}
          createPrompt={brainCreatePrompt(kind)}
          streaming={streaming}
          onStreamingChange={setStreaming}
          pendingSend={pendingSend}
          onPendingConsumed={() => setPendingSend(null)}
        />
        <Box
          sx={{
            border: '1px solid',
            borderColor: 'divider',
            borderRadius: 2,
            p: { xs: 2, sm: 2.5 },
            bgcolor: 'background.paper',
          }}
        >
          <BrainDraftEditor
            draft={draft}
            lockedSlug={draft.kind === 'skill' || draft.kind === 'agent' ? draft.slug : undefined}
            lockedTaskName={Boolean(editingTask?.builtIn)}
            builtInFollowUp={Boolean(editingFollowUp?.builtIn)}
            saving={saveMutation.isPending}
            error={saveError}
            onChange={setDraft}
            onDirty={markDirty}
            onSave={() => saveMutation.mutate()}
          />
        </Box>
      </Stack>
    </Stack>
  );
}
