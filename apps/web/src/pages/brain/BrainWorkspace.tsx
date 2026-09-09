import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Box, Stack } from '@mui/material';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  brainCreatePrompt,
  brainImprovePrompt,
  draftToChangeFile,
  emptyBrainChangeSet,
  emptyBrainDraft,
  latestBrainDraftFromMessages,
  latestBrainLibraryFilesFromMessages,
  mergeBrainDraft,
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
import { BrainDraftEditor } from './BrainDraftEditor';
import { BrainLibraryChangePanel } from './BrainLibraryChangePanel';
import { acceptLibraryFiles, followUpToDraft, saveCatalogDraft, taskToDraft } from './brainPersist';
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
  const libraryTab = kind === 'skill' || kind === 'agent';
  const [draft, setDraft] = useState<BrainDraft>(() => emptyBrainDraft(kind));
  const [dirtyKeys, setDirtyKeys] = useState<Set<string>>(() => new Set());
  const dirtyRef = useRef(dirtyKeys);
  dirtyRef.current = dirtyKeys;
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

  useEffect(() => {
    const last = [...messages].reverse().find(
      (msg) => msg.role === 'tool' && msg.toolResult?.toolName === 'propose_brain_draft' && !msg.toolResult.isError,
    );
    if (!last || last.id === appliedToolId) return;
    setAppliedToolId(last.id);
    const files = latestBrainLibraryFilesFromMessages(messages);
    if (files && files.length > 0) {
      setChangeSet((prev) => mergeProposedLibraryFiles(prev, files));
      setSaveError(null);
      onTabKind(files[0]?.kind ?? 'skill');
    }
    const proposed = latestBrainDraftFromMessages(messages);
    if (proposed && (proposed.kind === 'task' || proposed.kind === 'follow-up')) {
      setDraft((prev) => mergeBrainDraft(prev, proposed, dirtyRef.current));
      if (dirtyRef.current.size === 0) onTabKind(proposed.kind);
    }
  }, [appliedToolId, messages, onTabKind]);

  useEffect(() => {
    if (libraryTab) return;
    setDraft((prev) => (prev.kind === kind ? prev : emptyBrainDraft(kind)));
    setDirtyKeys(new Set());
    setSaveError(null);
  }, [kind, libraryTab]);

  const selectedFile = useMemo(
    () => changeSet.files.find((file) => file.id === changeSet.selectedId) ?? changeSet.files[0],
    [changeSet],
  );

  const selectedKey = useMemo(() => {
    if (libraryTab) {
      return selectedFile?.kind === kind ? (selectedFile.slug ?? null) : null;
    }
    if (draft.kind === 'task' || draft.kind === 'follow-up') return draft.id ?? null;
    return null;
  }, [draft, kind, libraryTab, selectedFile]);

  const markDirty = (key: string) => {
    setDirtyKeys((prev) => new Set(prev).add(key));
  };

  const seedLibrary = (markdown: BrainMarkdownDraft, improve?: boolean) => {
    const baseline = {
      name: markdown.name,
      description: markdown.description,
      content: markdown.content,
    };
    const file = draftToChangeFile(markdown, baseline);
    setChangeSet((prev) => {
      const files = [...prev.files.filter((item) => item.id !== file.id), file];
      return { files, selectedId: file.id };
    });
    setSaveError(null);
    if (improve) setPendingSend(brainImprovePrompt(markdown.kind, markdown.slug ?? markdown.name));
  };

  const beginCreate = () => {
    setSaveError(null);
    if (libraryTab) {
      setPendingSend(brainCreatePrompt(kind));
      return;
    }
    setDraft(emptyBrainDraft(kind));
    setDirtyKeys(new Set());
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
      return saveCatalogDraft(draft, editingTask, editingFollowUp);
    },
    onSuccess: async () => {
      await Promise.all([
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

  const acceptMutation = useMutation({
    mutationFn: async () => {
      setSaveError(null);
      const writable = changeSet.files.filter(
        (file) => file.name.trim().length > 0 && file.content.trim().length > 0,
      );
      return acceptLibraryFiles(writable);
    },
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['personal-skills'] }),
        queryClient.invalidateQueries({ queryKey: ['personal-agents'] }),
        queryClient.invalidateQueries({ queryKey: ['brain-sync'] }),
      ]);
      setChangeSet((prev) => {
        const remaining = prev.files.filter((file) => !result.succeededIds.includes(file.id));
        return {
          files: remaining,
          selectedId: remaining[0]?.id ?? null,
        };
      });
      if (result.failed.length > 0) {
        setSaveError(result.failed.join('\n'));
      }
    },
    onError: (error) => {
      setSaveError(error instanceof Error ? error.message : String(error));
    },
  });

  const listApi = {
    selectedKey,
    onNew: beginCreate,
    onSelectSkill: (skill: PersonalSkill) => seedLibrary(skillToMarkdown(skill)),
    onImproveSkill: (skill: PersonalSkill) => seedLibrary(skillToMarkdown(skill), true),
    onSelectAgent: (agent: PersonalAgent) => seedLibrary(agentToMarkdown(agent)),
    onImproveAgent: (agent: PersonalAgent) => seedLibrary(agentToMarkdown(agent), true),
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
          {libraryTab ? (
            <BrainLibraryChangePanel
              changeSet={changeSet}
              accepting={acceptMutation.isPending}
              error={saveError}
              onSelect={(fileId) => setChangeSet((prev) => selectBrainChangeFile(prev, fileId))}
              onUndo={(fileId) => setChangeSet((prev) => undoBrainChangeFile(prev, fileId))}
              onChangeFile={(fileId, next) =>
                setChangeSet((prev) =>
                  updateBrainChangeFile(prev, fileId, {
                    name: next.name,
                    description: next.description,
                    content: next.content,
                  }),
                )
              }
              onDirty={(fileId, key) => setChangeSet((prev) => updateBrainChangeFile(prev, fileId, {}, key))}
              onAccept={() => acceptMutation.mutate()}
            />
          ) : (
            <BrainDraftEditor
              draft={draft}
              lockedTaskName={Boolean(editingTask?.builtIn)}
              builtInFollowUp={Boolean(editingFollowUp?.builtIn)}
              saving={saveMutation.isPending}
              error={saveError}
              onChange={setDraft}
              onDirty={markDirty}
              onSave={() => saveMutation.mutate()}
            />
          )}
        </Box>
      </Stack>
    </Stack>
  );
}
