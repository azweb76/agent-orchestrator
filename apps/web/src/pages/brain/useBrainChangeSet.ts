import { useEffect, useState } from 'react';
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
  undoBrainChangeFile,
  updateBrainChangeFile,
  type BrainChangeFile,
  type BrainChangeSet,
  type BrainDraft,
  type BrainDraftKind,
} from '@agent-orchestrator/shared';
import { api } from '../../api/client';
import { acceptChangeFiles } from './brainPersist';

export interface BrainChangeSetApi {
  changeSet: BrainChangeSet;
  /** Unaccepted drafts; drives the Copilot tab badge. */
  pendingCount: number;
  /**
   * The kind the copilot is currently working on. Remembered rather than derived from the
   * active tab, since the copilot now has its own tab.
   */
  copilotKind: BrainDraftKind;
  streaming: boolean;
  setStreaming: (value: boolean) => void;
  pendingSend: string | null;
  consumePendingSend: () => void;
  saveError: string | null;
  accepting: boolean;
  /** Ask the copilot to draft a new item of this kind. */
  draftWithAi: (kind: BrainDraftKind) => void;
  /** Seed an existing row as a draft and ask the copilot to improve it. */
  improve: (draft: BrainDraft) => void;
  lockedTaskName: (file: BrainChangeFile) => boolean;
  builtInFollowUp: (file: BrainChangeFile) => boolean;
  select: (fileId: string) => void;
  undo: (fileId: string) => void;
  changeFile: (fileId: string, next: BrainDraft) => void;
  markDirty: (fileId: string, key: string) => void;
  accept: () => void;
}

/**
 * Owns the Brain copilot changeset. Lives at page level so a draft proposed while the user
 * is on an entity tab is never lost.
 */
export function useBrainChangeSet(): BrainChangeSetApi {
  const queryClient = useQueryClient();
  const [changeSet, setChangeSet] = useState(emptyBrainChangeSet);
  const [appliedToolId, setAppliedToolId] = useState<string | null>(null);
  const [copilotKind, setCopilotKind] = useState<BrainDraftKind>('skill');
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
    // Deliberately does not switch tabs: the drafts live on the Copilot tab, and the badge
    // signals them to anyone who has navigated away.
    setCopilotKind(files[0]?.kind ?? 'skill');
  }, [appliedToolId, messages]);

  const seedDraft = (draft: BrainDraft, improve?: boolean) => {
    const file = draftToChangeFile(draft, draft);
    setChangeSet((prev) => {
      const files = [...prev.files.filter((item) => item.id !== file.id), file];
      return { files, selectedId: file.id };
    });
    setSaveError(null);
    setCopilotKind(draft.kind);
    if (improve) setPendingSend(brainImprovePrompt(draft.kind, brainDraftIdentity(draft) ?? draft.name));
  };

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

  return {
    changeSet,
    pendingCount: changeSet.files.length,
    copilotKind,
    streaming,
    setStreaming,
    pendingSend,
    consumePendingSend: () => setPendingSend(null),
    saveError,
    accepting: acceptMutation.isPending,
    draftWithAi: (kind) => {
      setSaveError(null);
      setCopilotKind(kind);
      setPendingSend(brainCreatePrompt(kind));
    },
    improve: (draft) => seedDraft(draft, true),
    lockedTaskName: (file) => {
      const id = file.draft.kind === 'task' ? file.draft.id : undefined;
      return Boolean(id && tasksQuery.data?.find((item) => item.id === id)?.builtIn);
    },
    builtInFollowUp: (file) => {
      const id = file.draft.kind === 'follow-up' ? file.draft.id : undefined;
      return Boolean(id && followUpsQuery.data?.find((item) => item.id === id)?.builtIn);
    },
    select: (fileId) => {
      const next = selectBrainChangeFile(changeSet, fileId);
      setChangeSet(next);
      const file = next.files.find((item) => item.id === fileId);
      if (file) setCopilotKind(file.kind);
    },
    undo: (fileId) => setChangeSet((prev) => undoBrainChangeFile(prev, fileId)),
    changeFile: (fileId, next) => setChangeSet((prev) => updateBrainChangeFile(prev, fileId, next)),
    markDirty: (fileId, key) => setChangeSet((prev) => updateBrainChangeFile(prev, fileId, undefined, key)),
    accept: () => acceptMutation.mutate(),
  };
}
