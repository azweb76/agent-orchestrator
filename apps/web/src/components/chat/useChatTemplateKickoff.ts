import { useEffect, useRef } from 'react';
import type { ChatSessionTemplateId } from '@agent-orchestrator/shared';

export type ChatTemplateKickoffRequest = {
  template: ChatSessionTemplateId;
  nonce: number;
};

/** Starts a listed session template from navigation state or agent-page PR strip clicks. */
export function useChatTemplateKickoff(input: {
  archived: boolean;
  initialTemplate?: ChatSessionTemplateId;
  requested?: ChatTemplateKickoffRequest | null;
  createFromTemplateId: (templateId: string) => void;
}): void {
  const autoStartedRef = useRef(false);
  const lastNonceRef = useRef<number | null>(null);

  useEffect(() => {
    if (!input.initialTemplate || input.archived || autoStartedRef.current) return;
    autoStartedRef.current = true;
    input.createFromTemplateId(input.initialTemplate);
  }, [input.archived, input.createFromTemplateId, input.initialTemplate]);

  useEffect(() => {
    if (!input.requested || input.archived) return;
    if (lastNonceRef.current === input.requested.nonce) return;
    lastNonceRef.current = input.requested.nonce;
    input.createFromTemplateId(input.requested.template);
  }, [input.archived, input.createFromTemplateId, input.requested]);
}
