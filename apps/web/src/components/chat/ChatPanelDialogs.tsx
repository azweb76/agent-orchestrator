import type { UseMutationResult } from '@tanstack/react-query';
import type { ChatSession } from '@agent-orchestrator/shared';
import { ConfirmDialog } from '../ConfirmDialog';
import { GradeSessionDialog } from './GradeSessionDialog';
import { ImproveInstructionsDialog } from './ImproveInstructionsDialog';

interface ChatPanelDialogsProps {
  agentId: string;
  activeSessionId: string;
  session?: ChatSession;
  sessions: ChatSession[];
  clearOpen: boolean;
  rewindTarget: import('@agent-orchestrator/shared').Message | null;
  deleteTarget: ChatSession | null;
  gradeOpen: boolean;
  improveOpen: boolean;
  clearMutation: UseMutationResult<{ cleared: number }, Error, void>;
  rewindMutation: UseMutationResult<
    { draft: string },
    Error,
    string
  >;
  deleteSessionMutation: UseMutationResult<import('@agent-orchestrator/shared').AgentDetail, Error, ChatSession>;
  gradeMutation: UseMutationResult<ChatSession, Error, { notes?: string }>;
  onClearClose: () => void;
  onRewindClose: () => void;
  onDeleteClose: () => void;
  onGradeClose: () => void;
  onImproveClose: () => void;
  onImproveApplied: () => void;
  onImproveFromGrade: () => void;
}

export function ChatPanelDialogs({
  agentId,
  activeSessionId,
  session,
  sessions,
  clearOpen,
  rewindTarget,
  deleteTarget,
  gradeOpen,
  improveOpen,
  clearMutation,
  rewindMutation,
  deleteSessionMutation,
  gradeMutation,
  onClearClose,
  onRewindClose,
  onDeleteClose,
  onGradeClose,
  onImproveClose,
  onImproveApplied,
  onImproveFromGrade,
}: ChatPanelDialogsProps) {
  return (
    <>
      <ConfirmDialog
        open={clearOpen}
        title="Clear chat?"
        description="This clears this session's chat history and resets its Claude session. Your permission mode is kept. Other sessions are left as they are."
        confirmLabel="Clear"
        loading={clearMutation.isPending}
        onCancel={onClearClose}
        onConfirm={() => clearMutation.mutate()}
      />

      <ConfirmDialog
        open={Boolean(rewindTarget)}
        title="Rewind chat?"
        description="This removes the selected message and everything after it, resets the Claude session, and puts that prompt back in the composer so you can edit and resend. Earlier messages stay visible; the next send starts a fresh Claude session."
        confirmLabel="Rewind"
        confirmColor="warning"
        loading={rewindMutation.isPending}
        onCancel={onRewindClose}
        onConfirm={() => {
          if (rewindTarget) rewindMutation.mutate(rewindTarget.id);
        }}
      />

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={deleteTarget ? `Delete ${deleteTarget.title}?` : 'Delete session?'}
        description={
          deleteTarget && sessions.length <= 1
            ? `This deletes ${deleteTarget.title} and its messages. A new empty chat session will be created.${
                deleteTarget.status === 'running' ? ' The running reply will be stopped.' : ''
              }`
            : `This deletes this session and its messages. It cannot be undone.${
                deleteTarget?.status === 'running' ? ' The running reply will be stopped.' : ''
              } Other sessions are left as they are.`
        }
        confirmLabel="Delete"
        loading={deleteSessionMutation.isPending}
        onCancel={onDeleteClose}
        onConfirm={() => {
          if (deleteTarget) deleteSessionMutation.mutate(deleteTarget);
        }}
      />

      <GradeSessionDialog
        open={gradeOpen}
        sessionTitle={session?.title ?? 'this session'}
        sessionFilePath={session?.grade?.analysis?.sessionFilePath ?? session?.runLogPath}
        current={session?.grade}
        loading={gradeMutation.isPending}
        error={gradeMutation.error ? (gradeMutation.error as Error).message : null}
        onClose={onGradeClose}
        onAnalyze={(notes) => gradeMutation.mutate({ notes: notes.trim() || undefined })}
        onImprove={onImproveFromGrade}
      />

      {activeSessionId ? (
        <ImproveInstructionsDialog
          open={improveOpen}
          agentId={agentId}
          sessionId={activeSessionId}
          onClose={onImproveClose}
          onApplied={onImproveApplied}
        />
      ) : null}
    </>
  );
}
