import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Button, Stack, Typography } from '@mui/material';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BRAIN_GARDEN_PROMPT,
  formatAskUserAnswers,
  formatReferencedSessionPrompt,
  type AssistantMessage,
  type BrainDraftKind,
  type SessionGradeListItem,
} from '@agent-orchestrator/shared';
import { api, streamAssistantChat } from '../../api/client';
import { applyAssistantStreamEvent } from '../../components/dashboard/assistantStreamReducer';
import { ClaudeChat } from '../../components/claude-chat/ClaudeChat';
import { EmptyState } from '../../components/ui/EmptyState';
import { ControlTooltip } from '../../components/ui/ControlTooltip';
import { BrainSessionPicker } from './BrainSessionPicker';
import { assistantAskUserPermission, mapAssistantMessagesToChatTurns } from './mapAssistantChat';

const KIND_LABEL: Record<BrainDraftKind, string> = {
  skill: 'New skill',
  agent: 'New agent',
  task: 'New task',
  'follow-up': 'New follow-up',
};

export function BrainCopilot({
  kind,
  createPrompt,
  streaming,
  onStreamingChange,
  pendingSend,
  onPendingConsumed,
}: {
  kind: BrainDraftKind;
  createPrompt: string;
  streaming: boolean;
  onStreamingChange: (value: boolean) => void;
  pendingSend: string | null;
  onPendingConsumed: () => void;
}) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState('');
  const [referenced, setReferenced] = useState<SessionGradeListItem[]>([]);
  const referencedRef = useRef(referenced);
  referencedRef.current = referenced;
  const [streamError, setStreamError] = useState<string | null>(null);
  const [streamingIds, setStreamingIds] = useState<Set<string>>(() => new Set());
  const abortRef = useRef<AbortController | null>(null);

  const messagesQuery = useQuery({
    queryKey: ['assistant', 'messages'],
    queryFn: () => api.getAssistantMessages(),
  });
  const clear = useMutation({
    mutationFn: () => api.clearAssistantMessages(),
    onSuccess: () => {
      queryClient.setQueryData(['assistant', 'messages'], { messages: [] });
    },
  });

  const messages = messagesQuery.data?.messages ?? [];
  const turns = useMemo(
    () => mapAssistantMessagesToChatTurns(messages, streamingIds),
    [messages, streamingIds],
  );
  const askPermission = useMemo(() => assistantAskUserPermission(messages), [messages]);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const send = useCallback(
    async (content: string) => {
      const trimmed = formatReferencedSessionPrompt(referencedRef.current, content);
      if (!trimmed || streaming) return;
      setDraft('');
      setStreamError(null);
      onStreamingChange(true);
      setStreamingIds(new Set());
      const optimistic: AssistantMessage = {
        id: `optimistic-${Date.now()}`,
        role: 'user',
        content: trimmed,
        createdAt: new Date().toISOString(),
      };
      const previous = messagesQuery.data?.messages ?? [];
      queryClient.setQueryData(['assistant', 'messages'], {
        messages: [...previous, optimistic],
      });
      const abort = new AbortController();
      abortRef.current = abort;
      try {
        await streamAssistantChat(
          trimmed,
          (event) => {
            if (event.type === 'assistant_start') {
              setStreamingIds((prev) => new Set(prev).add(event.messageId));
            }
            if (event.type === 'assistant_message') {
              setStreamingIds((prev) => {
                const next = new Set(prev);
                next.delete(event.message.id);
                return next;
              });
            }
            queryClient.setQueryData(
              ['assistant', 'messages'],
              (old: { messages: AssistantMessage[] } | undefined) => ({
                messages: applyAssistantStreamEvent(old?.messages ?? [], event),
              }),
            );
          },
          abort.signal,
        );
        void queryClient.invalidateQueries({ queryKey: ['assistant', 'messages'] });
        void queryClient.invalidateQueries({ queryKey: ['personal-skills'] });
        void queryClient.invalidateQueries({ queryKey: ['personal-agents'] });
        void queryClient.invalidateQueries({ queryKey: ['agent-tasks'] });
        void queryClient.invalidateQueries({ queryKey: ['task-followups'] });
      } catch (error) {
        if (abort.signal.aborted) return;
        setStreamError(error instanceof Error ? error.message : String(error));
        void queryClient.invalidateQueries({ queryKey: ['assistant', 'messages'] });
      } finally {
        onStreamingChange(false);
        setStreamingIds(new Set());
        abortRef.current = null;
      }
    },
    [messagesQuery.data?.messages, onStreamingChange, queryClient, streaming],
  );

  useEffect(() => {
    if (!pendingSend) return;
    void send(pendingSend);
    onPendingConsumed();
  }, [onPendingConsumed, pendingSend, send]);

  const busy = streaming || clear.isPending;
  const starterLabel = KIND_LABEL[kind];
  const pendingPermissions = askPermission ? [askPermission] : [];

  return (
    <Stack spacing={1.25} sx={{ minHeight: 0, flex: 1 }}>
      <Box
        sx={{
          minHeight: { xs: 360, md: 460 },
          height: { xs: 420, md: 520 },
          display: 'flex',
          flexDirection: 'column',
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 2,
          overflow: 'hidden',
          bgcolor: 'background.paper',
        }}
      >
        <ClaudeChat
          messages={turns}
          pendingPermissions={pendingPermissions}
          status={streaming ? 'streaming' : askPermission ? 'awaiting_input' : 'idle'}
          loading={messagesQuery.isLoading}
          error={streamError ?? (messagesQuery.error ? (messagesQuery.error as Error).message : null)}
          onAnswerQuestions={(_prompt, answers, response) => {
            const text = formatAskUserAnswers(answers, response);
            if (text) void send(text);
          }}
          onSkipQuestions={() => {
            void send('Skip these questions.');
          }}
          composer={{
            draft,
            onDraftChange: setDraft,
            onSend: ({ text }) => void send(text),
            onStop: () => abortRef.current?.abort(),
            onClear: () => clear.mutate(),
            disabled: busy,
            placeholder: 'Steer the draft…',
            slashCommands: [
              { id: 'new', command: '/new', description: starterLabel, prompt: createPrompt, kind: 'prompt' },
              {
                id: 'garden',
                command: '/garden',
                description: 'Garden from grades',
                prompt: BRAIN_GARDEN_PROMPT,
                kind: 'prompt',
              },
            ],
          }}
          slots={{
            header: (
              <Stack
                spacing={1}
                sx={{
                  px: { xs: 1.5, sm: 2 },
                  pt: 1.25,
                  pb: 1,
                  borderBottom: 1,
                  borderColor: 'divider',
                }}
              >
                <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
                  <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                    <AutoAwesomeOutlinedIcon sx={{ color: 'secondary.main', fontSize: 20 }} />
                    <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                      Brain copilot
                    </Typography>
                  </Stack>
                  <ControlTooltip title="Clear conversation">
                    <span>
                      <Button size="small" disabled={messages.length === 0 || busy} onClick={() => clear.mutate()}>
                        Clear
                      </Button>
                    </span>
                  </ControlTooltip>
                </Stack>
                <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
                  <Button size="small" variant="outlined" disabled={busy} onClick={() => void send(createPrompt)}>
                    {starterLabel}
                  </Button>
                  <Button
                    size="small"
                    variant="outlined"
                    disabled={busy}
                    onClick={() => void send(BRAIN_GARDEN_PROMPT)}
                  >
                    Garden from grades
                  </Button>
                </Stack>
              </Stack>
            ),
            emptyState: (
              <EmptyState
                compact
                icon={<AutoAwesomeOutlinedIcon />}
                title="Draft with the copilot"
                description="Describe what to create or improve. Attach analyzed sessions if they should inform the draft. Pending skills, agents, tasks, and follow-ups land in the changeset for you to edit, undo, and Accept."
              />
            ),
            banners: <BrainSessionPicker selected={referenced} onChange={setReferenced} disabled={streaming} />,
          }}
        />
      </Box>
    </Stack>
  );
}
