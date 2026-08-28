import { useCallback } from 'react';
import { extractPlanFromInput, parseAskUserQuestions, type Message, type PermissionRequest } from '@agent-orchestrator/shared';
import { AskUserQuestionCard } from './AskUserQuestionCard';
import { ChatBubble } from './ChatBubble';
import { ExitPlanModeCard } from './ExitPlanModeCard';
import { FocusablePermissionShell } from './FocusablePermissionShell';
import { MessageTimeline } from './MessageTimeline';
import type { PendingImage } from './composerTypes';
import type { PendingMention } from './mentionComposer';
import { ToolPermissionCard } from './ToolPermissionCard';

interface ChatPanelRenderersOptions {
  archived: boolean;
  focusPermissions: boolean;
  permissionBusy: boolean;
  permissionRequests: PermissionRequest[];
  lastFailed: { text: string; images: PendingImage[]; mentions: PendingMention[] } | null;
  priorUserByIndex: Map<number, Message | undefined>;
  onPermissionError: (message: string) => void;
  submitAnswers: (
    request: PermissionRequest,
    answers: Record<string, string>,
    response?: string,
    onError?: (message: string) => void,
  ) => Promise<void>;
  skipAskUserQuestion: (request: PermissionRequest, onError?: (message: string) => void) => Promise<void>;
  buildPlan: (request: PermissionRequest, setPermissionBusy: (v: boolean) => void) => Promise<void>;
  setPermissionBusy: (v: boolean) => void;
  keepPlanning: (
    request: PermissionRequest,
    abortSession: (sid: string) => void,
    onError?: (message: string) => void,
  ) => Promise<void>;
  abortSession: (sid: string) => void;
  allowTool: (request: PermissionRequest, onError?: (message: string) => void) => Promise<void>;
  denyTool: (request: PermissionRequest, onError?: (message: string) => void) => Promise<void>;
  requestRewind: (message: Message) => void;
  runChat: (
    text: string,
    images: PendingImage[],
    mentions: PendingMention[],
    force: boolean,
  ) => Promise<void>;
}

export function useChatPanelRenderers({
  archived,
  focusPermissions,
  permissionBusy,
  permissionRequests,
  lastFailed,
  priorUserByIndex,
  onPermissionError,
  submitAnswers,
  skipAskUserQuestion,
  buildPlan,
  setPermissionBusy,
  keepPlanning,
  abortSession,
  allowTool,
  denyTool,
  requestRewind,
  runChat,
}: ChatPanelRenderersOptions) {
  const renderPermissionRequest = useCallback(
    (request: PermissionRequest) => {
      const card =
        request.toolName === 'AskUserQuestion' ? (
          <AskUserQuestionCard
            key={request.requestId}
            request={request}
            questions={parseAskUserQuestions(request.input)}
            submitting={permissionBusy}
            onSubmit={(answers, response) =>
              void submitAnswers(request, answers, response, onPermissionError)
            }
            onDismiss={() => void skipAskUserQuestion(request, onPermissionError)}
          />
        ) : request.toolName === 'ExitPlanMode' ? (
          <ExitPlanModeCard
            key={request.requestId}
            request={request}
            plan={extractPlanFromInput(request.input)}
            submitting={permissionBusy}
            onBuild={() => void buildPlan(request, setPermissionBusy)}
            onKeepPlanning={() =>
              void keepPlanning(request, abortSession, onPermissionError)
            }
          />
        ) : (
          <ToolPermissionCard
            key={request.requestId}
            request={request}
            submitting={permissionBusy}
            onAllow={() => void allowTool(request, onPermissionError)}
            onDeny={() => void denyTool(request, onPermissionError)}
          />
        );

      return (
        <FocusablePermissionShell key={request.requestId} highlight={focusPermissions}>
          {card}
        </FocusablePermissionShell>
      );
    },
    [
      abortSession,
      allowTool,
      buildPlan,
      denyTool,
      focusPermissions,
      keepPlanning,
      onPermissionError,
      permissionBusy,
      setPermissionBusy,
      skipAskUserQuestion,
      submitAnswers,
    ],
  );

  const renderMessage = useCallback(
    (message: Message, index: number) => {
      if (message.role === 'assistant') {
        const priorUser = priorUserByIndex.get(index);
        return (
          <MessageTimeline
            message={message}
            permissionRequests={permissionRequests}
            onRetry={
              message.metadata?.error && priorUser && priorUser.attachments.length === 0
                ? () => void runChat(priorUser.content, [], [], true)
                : undefined
            }
          />
        );
      }
      return (
        <ChatBubble
          message={message}
          onCopy={() => void navigator.clipboard.writeText(message.content)}
          onRewind={!archived ? () => requestRewind(message) : undefined}
          onRetry={
            message.metadata?.error && lastFailed
              ? () => void runChat(lastFailed.text, lastFailed.images, lastFailed.mentions, true)
              : undefined
          }
        />
      );
    },
    [archived, lastFailed, permissionRequests, priorUserByIndex, requestRewind, runChat],
  );

  return { renderPermissionRequest, renderMessage };
}
