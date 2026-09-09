import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  IconButton,
  InputAdornment,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import AutoAwesomeOutlinedIcon from '@mui/icons-material/AutoAwesomeOutlined';
import SendIcon from '@mui/icons-material/Send';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BRAIN_GARDEN_PROMPT,
  formatAskUserAnswers,
  formatReferencedSessionPrompt,
  latestAskUserQuestionsFromMessages,
  type AssistantMessage,
  type BrainDraftKind,
  type SessionGradeListItem,
} from '@agent-orchestrator/shared';
import { api, streamAssistantChat } from '../../api/client';
import { applyAssistantStreamEvent } from '../../components/dashboard/assistantStreamReducer';
import { AssistantBubble } from '../../components/dashboard/AssistantChatBubbles';
import { AskUserQuestionCard } from '../../components/chat/AskUserQuestionCard';
import { ControlTooltip } from '../../components/ui/ControlTooltip';
import { BrainSessionPicker } from './BrainSessionPicker';

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
  const bottomRef = useRef<HTMLDivElement | null>(null);
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
  const questions = latestAskUserQuestionsFromMessages(messages);
  const lastContent = messages[messages.length - 1]?.content;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages.length, streaming, lastContent]);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const send = async (content: string) => {
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
  };

  useEffect(() => {
    if (!pendingSend) return;
    void send(pendingSend);
    onPendingConsumed();
  }, [pendingSend]);

  const busy = streaming || clear.isPending;
  const starterLabel = KIND_LABEL[kind];

  return (
    <Stack spacing={1.25} sx={{ minHeight: 0, flex: 1 }}>
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

      <Box
        sx={{
          flex: 1,
          minHeight: 180,
          maxHeight: { xs: 320, md: 420 },
          overflow: 'auto',
          border: '1px solid',
          borderColor: 'divider',
          borderRadius: 2,
          bgcolor: 'ao.surface.overlay',
          px: { xs: 1.25, sm: 1.75 },
          py: 1.5,
        }}
      >
        {messages.length === 0 && !streaming ? (
          <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.55 }}>
            Describe what to create or improve. Attach analyzed sessions if they should inform the
            draft. The copilot fills pending skill and agent files for you to edit, undo, and Accept.
          </Typography>
        ) : (
          <Stack spacing={1.75}>
            {messages.map((message) =>
              message.role === 'tool' &&
              (message.toolResult?.toolName === 'ask_user' ||
                message.toolResult?.toolName === 'propose_brain_draft') ? null : (
                <AssistantBubble
                  key={message.id}
                  message={message}
                  streaming={streamingIds.has(message.id)}
                />
              ),
            )}
            {streaming && streamingIds.size === 0 ? (
              <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
                <CircularProgress size={14} color="secondary" />
                <Typography variant="caption" color="text.secondary">
                  Thinking…
                </Typography>
              </Stack>
            ) : null}
            <div ref={bottomRef} />
          </Stack>
        )}
      </Box>

      {questions && questions.length > 0 ? (
        <AskUserQuestionCard
          questions={questions}
          submitting={streaming}
          onSubmit={(answers, response) => {
            const text = formatAskUserAnswers(answers, response);
            if (text) void send(text);
          }}
        />
      ) : null}

      {streamError ? <Alert severity="error">{streamError}</Alert> : null}

      <BrainSessionPicker selected={referenced} onChange={setReferenced} disabled={streaming} />

      <TextField
        size="small"
        fullWidth
        multiline
        maxRows={4}
        placeholder="Steer the draft…"
        value={draft}
        disabled={streaming}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            void send(draft);
          }
        }}
        slotProps={{
          input: {
            endAdornment: (
              <InputAdornment position="end" sx={{ alignSelf: 'flex-end', mb: 0.5 }}>
                <ControlTooltip title="Send">
                  <span>
                    <IconButton
                      color="secondary"
                      aria-label="Send message"
                      disabled={!draft.trim() || streaming}
                      onClick={() => void send(draft)}
                      edge="end"
                    >
                      {streaming ? <CircularProgress size={18} color="inherit" /> : <SendIcon fontSize="small" />}
                    </IconButton>
                  </span>
                </ControlTooltip>
              </InputAdornment>
            ),
            sx: { alignItems: 'flex-end', borderRadius: 2, bgcolor: 'ao.surface.inset' },
          },
        }}
      />
    </Stack>
  );
}
