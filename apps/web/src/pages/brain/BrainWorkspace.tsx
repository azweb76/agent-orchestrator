import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Box, Stack } from '@mui/material';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  brainCreatePrompt,
  brainDraftIdentity,
  brainImprovePrompt,
  brainLibraryFileCanAccept,
  draftToChangeFile,
  emptyBrainChangeSet,
  latestBrainLibraryFilesFromMessages,
  mergeProposedLibraryFiles,
  selectBrainChangeFile,
  stripMarkdownFrontmatter,
  undoBrainChangeFile,
  updateBrainChangeFile,
  type AgentTask,
  type BrainDraft,
  type BrainDraftKind,
  type BrainMarkdownDraft,
  type PersonalAgent,
  type PersonalSkill,
  type TaskFollowUp,
} from '@agent-orchestrator/shared';
import { api } from '../../api/client';
import { BrainCopilot } from './BrainCopilot';
import { BrainLibraryChangePanel } from './BrainLibraryChangePanel';
import { acceptChangeFiles, followUpToDraft, taskToDraft } from './brainPersist';
import type { BrainTab } from './brainTabs';

function tabToKind(tab: BrainTab): BrainDraftKind {
  if (tab === 'agents') return 'agent';
  if (tab === 'tasks') return 'task';
  if (tab === 'follow-ups') return 'follow-up';
  return 'skill';
}

function skillToMarkdown(skill: PersonalSkill): BrainMarkdownDraft {
  return {
    kind: 'skill',
    slug: skill.slug,
    name: skill.name,
    description: skill.description,
    content: stripMarkdownFrontmatter(skill.content),
  };
}

function agentToMarkdown(agent: PersonalAgent): BrainMarkdownDraft {
  return {
    kind: 'agent',
    slug: agent.slug,
    name: agent.name,
    description: agent.description,
    content: stripMarkdownFrontmatter(agent.content),
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
  const [changeSet, setChangeSet] = useState(emptyBrainChangeSet);
  const [appliedToolId, setAppliedToolId] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [pendingSend, setPendingSend] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const messagesQuery = useQuery({
    queryKey: ['assistant', 'messages'],
    queryFn: () => api.getAssistantMessages(),
  });
  const messages = messagesQuery.data?.messages ?? [];
  const tasksQuery = useQuery({ queryKey: ['agent-tasks'], queryFn: api.listAgentTasks });
  const followUpsQuery = useQuery({ queryKey: ['task-followups'], queryFn: api.listTaskFollowUps });

  useEffect(() => {
    const last = [...messages].reverse().find(
      (msg) => msg.role === 'tool' && msg.toolResult?.toolName === 'propose_brain_draft' && !msg.toolResult.isError,
    );
    if (!last || last.id === appliedToolId) return;
    setAppliedToolId(last.id);
    const files = latestBrainLibraryFilesFromMessages(messages);
    if (!files || files.length === 0) return;
    setChangeSet((prev) => mergeProposedLibraryFiles(prev, files));
    setSaveError(null);
    onTabKind(files[0]?.kind ?? 'skill');
  }, [appliedToolId, messages, onTabKind]);

  const selectedFile = useMemo(
    () => changeSet.files.find((file) => file.id === changeSet.selectedId) ?? changeSet.files[0],
    [changeSet],
  );

  const selectedKey = useMemo(() => {
    if (!selectedFile || selectedFile.kind !== kind) return null;
    return brainDraftIdentity(selectedFile.draft) ?? null;
  }, [kind, selectedFile]);

  const seedDraft = (draft: BrainDraft, improve?: boolean) => {
    const file = draftToChangeFile(draft, draft);
    setChangeSet((prev) => {
      const files = [...prev.files.filter((item) => item.id !== file.id), file];
      return { files, selectedId: file.id };
    });
    setSaveError(null);
    if (improve) setPendingSend(brainImprovePrompt(draft.kind, brainDraftIdentity(draft) ?? draft.name));
  };

  const beginCreate = () => {
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

  const acceptMutation = useMutation({
    mutationFn: async () => {
      setSaveError(null);
      const writable = changeSet.files.filter((file) => {
        const followUpId = file.draft.kind === 'follow-up' ? file.draft.id : undefined;
        return brainLibraryFileCanAccept(
          file,
          Boolean(followUpId && followUpsQuery.data?.find((item) => item.id === followUpId)?.builtIn),
        );
      });
      return acceptChangeFiles(writable, {
        tasks: tasksQuery.data,
        followUps: followUpsQuery.data,
      });
    },
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['personal-skills'] }),
        queryClient.invalidateQueries({ queryKey: ['personal-agents'] }),
        queryClient.invalidateQueries({ queryKey: ['agent-tasks'] }),
        queryClient.invalidateQueries({ queryKey: ['task-followups'] }),
        queryClient.invalidateQueries({ queryKey: ['brain-sync'] }),
      ]);
      setChangeSet((prev) => {
        const remaining = prev.files.filter((file) => !result.succeededIds.includes(file.id));
        return { files: remaining, selectedId: remaining[0]?.id ?? null };
      });
      if (result.failed.length > 0) setSaveError(result.failed.join('\n'));
    },
    onError: (error) => {
      setSaveError(error instanceof Error ? error.message : String(error));
    },
  });

  const listApi = {
    selectedKey,
    onNew: beginCreate,
    onSelectSkill: (skill: PersonalSkill) => seedDraft(skillToMarkdown(skill)),
    onImproveSkill: (skill: PersonalSkill) => seedDraft(skillToMarkdown(skill), true),
    onSelectAgent: (agent: PersonalAgent) => seedDraft(agentToMarkdown(agent)),
    onImproveAgent: (agent: PersonalAgent) => seedDraft(agentToMarkdown(agent), true),
    onSelectTask: (task: AgentTask) => seedDraft(taskToDraft(task)),
    onImproveTask: (task: AgentTask) => seedDraft(taskToDraft(task), true),
    onSelectFollowUp: (followUp: TaskFollowUp) => seedDraft(followUpToDraft(followUp)),
    onImproveFollowUp: (followUp: TaskFollowUp) => seedDraft(followUpToDraft(followUp), true),
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
          <BrainLibraryChangePanel
            changeSet={changeSet}
            accepting={acceptMutation.isPending}
            error={saveError}
            lockedTaskName={(file) => {
              const id = file.draft.kind === 'task' ? file.draft.id : undefined;
              return Boolean(id && tasksQuery.data?.find((item) => item.id === id)?.builtIn);
            }}
            builtInFollowUp={(file) => {
              const id = file.draft.kind === 'follow-up' ? file.draft.id : undefined;
              return Boolean(id && followUpsQuery.data?.find((item) => item.id === id)?.builtIn);
            }}
            onSelect={(fileId) => {
              const next = selectBrainChangeFile(changeSet, fileId);
              setChangeSet(next);
              const file = next.files.find((item) => item.id === fileId);
              if (file) onTabKind(file.kind);
            }}
            onUndo={(fileId) => setChangeSet((prev) => undoBrainChangeFile(prev, fileId))}
            onChangeFile={(fileId, next) => setChangeSet((prev) => updateBrainChangeFile(prev, fileId, next))}
            onDirty={(fileId, key) => setChangeSet((prev) => updateBrainChangeFile(prev, fileId, undefined, key))}
            onAccept={() => acceptMutation.mutate()}
          />
        </Box>
      </Stack>
    </Stack>
  );
}
