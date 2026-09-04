import { Alert, Box, Button } from '@mui/material';
import { useQuery, type UseMutationResult } from '@tanstack/react-query';
import type { AgentDetail, ChatSession, EffortLevel, InstructionDraftOffer, TaskSuggestion } from '@agent-orchestrator/shared';
import { api } from '../../api/client';
import { useVisualViewportInset } from '../../hooks/useVisualViewportInset';
import { ControlTooltip } from '../ui/ControlTooltip';
import { ChatComposer, type PendingImage, type QueuedChatItem } from './ChatComposer';
import { CompactContinueBanner } from './CompactContinueBanner';
import { DraftPrOfferBanner } from './DraftPrOfferBanner';
import { InstructionDraftOfferBanner } from './InstructionDraftOfferBanner';
import { TaskSuggestionsBanner } from './TaskSuggestionsBanner';
import { CHAT_COLUMN_MAX_WIDTH } from './ChatTranscriptList';
import type { PendingMention } from './mentionComposer';

interface ChatPanelFooterProps {
  agentId: string;
  agent?: Pick<AgentDetail, 'draftPrOffer' | 'taskSuggestions' | 'instructionDraftOffer'>;
  archived: boolean;
  activeSessionId: string;
  session?: ChatSession;
  agentDefaults?: {
    model: string;
    effort: EffortLevel;
    permissionMode: ChatSession['permissionMode'];
  };
  sessionBusy: boolean;
  stoppedSessionId: string | null;
  compacting: boolean;
  chatError: string | null;
  lastFailed: { text: string; images: PendingImage[]; mentions: PendingMention[] } | null;
  queue: QueuedChatItem[];
  draft: string;
  displayMessageCount: number;
  clearMutation: UseMutationResult<unknown, Error, void>;
  rewindMutation: UseMutationResult<unknown, Error, string>;
  deleteSessionMutation: UseMutationResult<unknown, Error, ChatSession>;
  gradeMutation: UseMutationResult<unknown, Error, { notes?: string }>;
  onDraftChange: (value: string) => void;
  onModelChange: (model: string) => void;
  onEffortChange: (effort: EffortLevel) => void;
  onPermissionModeChange: (mode: NonNullable<ChatSession['permissionMode']>) => void;
  onSend: (text: string, images: PendingImage[], mentions: PendingMention[], force: boolean) => void;
  onStop: () => void;
  onClear: () => void;
  onRewind: () => void;
  onGradeOpen: () => void;
  onImproveOpen: (offer?: InstructionDraftOffer | null) => void;
  onCompact: () => void;
  onRemoveQueued: (id: string) => void;
  onChatErrorClose: () => void;
  onRetryFailed: () => void;
  onCreateDraftPr?: () => void;
  creatingDraftPr?: boolean;
  onSelectTaskSuggestion?: (suggestion: TaskSuggestion) => void;
  creatingFromSuggestion?: boolean;
}

export function ChatPanelFooter({
  agentId,
  agent,
  archived,
  activeSessionId,
  session,
  agentDefaults,
  sessionBusy,
  stoppedSessionId,
  compacting,
  chatError,
  lastFailed,
  queue,
  draft,
  displayMessageCount,
  clearMutation,
  rewindMutation,
  deleteSessionMutation,
  onDraftChange,
  onModelChange,
  onEffortChange,
  onPermissionModeChange,
  onSend,
  onStop,
  onClear,
  onRewind,
  onGradeOpen,
  onImproveOpen,
  onCompact,
  onRemoveQueued,
  onChatErrorClose,
  onRetryFailed,
  onCreateDraftPr,
  creatingDraftPr,
  onSelectTaskSuggestion,
  creatingFromSuggestion,
}: ChatPanelFooterProps) {
  const keyboardInset = useVisualViewportInset();
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: api.getSettings });

  return (
    <Box
      sx={{
        flexShrink: 0,
        borderTop: 1,
        borderColor: 'divider',
        bgcolor: 'ao.surface.panel',
        backdropFilter: 'blur(12px)',
      }}
    >
      <Box
        sx={{
          maxWidth: CHAT_COLUMN_MAX_WIDTH,
          mx: 'auto',
          px: { xs: 1.25, sm: 2.5 },
          py: { xs: 1.25, sm: 1.5 },
          pb: {
            xs: `calc(10px + env(safe-area-inset-bottom, 0px) + ${keyboardInset}px)`,
            sm: 1.5,
          },
        }}
      >
        {!archived && session ? (
          <InstructionDraftOfferBanner
            agentId={agentId}
            agent={agent}
            session={session}
            isStreaming={sessionBusy}
            onReview={onImproveOpen}
          />
        ) : null}

        {!archived && agent && session ? (
          <DraftPrOfferBanner
            agent={agent}
            session={session}
            isStreaming={sessionBusy}
            onCreateDraftPr={() => onCreateDraftPr?.()}
            creating={creatingDraftPr}
          />
        ) : null}

        {!archived && agent && session ? (
          <TaskSuggestionsBanner
            agent={agent}
            session={session}
            isStreaming={sessionBusy}
            onSelect={(suggestion) => onSelectTaskSuggestion?.(suggestion)}
            creating={creatingFromSuggestion}
          />
        ) : null}

        {!archived && activeSessionId ? (
          <CompactContinueBanner
            agentId={agentId}
            sessionId={activeSessionId}
            isStreaming={sessionBusy}
            stopped={stoppedSessionId === activeSessionId}
            compacting={compacting}
            onCompact={onCompact}
          />
        ) : null}

        {chatError && (
          <Alert
            severity="error"
            sx={{ mb: 1 }}
            action={
              lastFailed ? (
                <ControlTooltip title="Retry sending the last message">
                  <Button color="inherit" size="small" onClick={onRetryFailed}>
                    Retry
                  </Button>
                </ControlTooltip>
              ) : undefined
            }
            onClose={onChatErrorClose}
          >
            {chatError}
          </Alert>
        )}

        {clearMutation.error && (
          <Alert severity="error" sx={{ mb: 1 }}>
            {(clearMutation.error as Error).message}
          </Alert>
        )}

        {rewindMutation.error && (
          <Alert severity="error" sx={{ mb: 1 }} onClose={() => rewindMutation.reset()}>
            {(rewindMutation.error as Error).message}
          </Alert>
        )}

        {deleteSessionMutation.error && (
          <Alert severity="error" sx={{ mb: 1 }} onClose={() => deleteSessionMutation.reset()}>
            {(deleteSessionMutation.error as Error).message}
          </Alert>
        )}

        <ChatComposer
          agentId={agentId}
          sessionId={activeSessionId}
          archived={archived}
          isStreaming={sessionBusy}
          model={session?.model ?? agentDefaults?.model ?? 'sonnet'}
          effort={session?.effort ?? agentDefaults?.effort ?? 'high'}
          permissionMode={session?.permissionMode ?? agentDefaults?.permissionMode ?? 'plan'}
          queue={queue}
          draft={draft}
          onDraftChange={onDraftChange}
          onModelChange={onModelChange}
          onEffortChange={onEffortChange}
          onPermissionModeChange={onPermissionModeChange}
          onSend={onSend}
          onStop={onStop}
          onClear={onClear}
          onRewind={onRewind}
          grade={session?.grade}
          canGrade={Boolean(settings?.analyzeSessionEnabled) && (displayMessageCount > 0 || Boolean(session?.grade))}
          onGrade={settings?.analyzeSessionEnabled ? onGradeOpen : undefined}
          onRemoveQueued={onRemoveQueued}
        />
      </Box>
    </Box>
  );
}
