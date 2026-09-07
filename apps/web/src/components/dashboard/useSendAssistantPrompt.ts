import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { AssistantMessage } from '@agent-orchestrator/shared';
import { streamAssistantChat } from '../../api/client';
import { applyAssistantStreamEvent } from './assistantStreamReducer';

/** Stream a user prompt into the fleet Assistant thread (Command chat). */
export function useSendAssistantPrompt(options?: { scrollToChat?: boolean }) {
  const queryClient = useQueryClient();
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendPrompt = useCallback(
    async (prompt: string) => {
      if (sending) return;
      setSending(true);
      setError(null);
      if (options?.scrollToChat !== false) {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
      try {
        await streamAssistantChat(prompt, (event) => {
          queryClient.setQueryData(
            ['assistant', 'messages'],
            (old: { messages: AssistantMessage[] } | undefined) => ({
              messages: applyAssistantStreamEvent(old?.messages ?? [], event),
            }),
          );
        });
        void queryClient.invalidateQueries({ queryKey: ['assistant', 'messages'] });
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        void queryClient.invalidateQueries({ queryKey: ['assistant', 'messages'] });
      } finally {
        setSending(false);
      }
    },
    [options?.scrollToChat, queryClient, sending],
  );

  return {
    sendPrompt,
    sending,
    error,
    clearError: () => setError(null),
  };
}
