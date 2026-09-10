import { FocusablePermissionShell } from './permissions/FocusablePermissionShell';
import { AskUserQuestionCard } from './permissions/AskUserQuestionCard';
import { ExitPlanModeCard } from './permissions/ExitPlanModeCard';
import { ToolPermissionCard } from './permissions/ToolPermissionCard';
import { parseQuestions } from './parseQuestions';
import type { ClaudeChatProps, PermissionPrompt } from './types';

function extractPlan(input: Record<string, unknown>): string {
  return typeof input.plan === 'string' ? input.plan.trim() : '';
}

export function DefaultPermissionCard({
  prompt,
  busy,
  highlight,
  onAllow,
  onDeny,
  onAnswer,
  onSkip,
  planFollowUps,
  planFollowUpsLoading,
  onSelectPlanFollowUp,
}: {
  prompt: PermissionPrompt;
  busy?: boolean;
  highlight?: boolean;
  onAllow?: ClaudeChatProps['onAllowPermission'];
  onDeny?: ClaudeChatProps['onDenyPermission'];
  onAnswer?: ClaudeChatProps['onAnswerQuestions'];
  onSkip?: ClaudeChatProps['onSkipQuestions'];
  planFollowUps?: ClaudeChatProps['planFollowUps'];
  planFollowUpsLoading?: ClaudeChatProps['planFollowUpsLoading'];
  onSelectPlanFollowUp?: ClaudeChatProps['onSelectPlanFollowUp'];
}) {
  const card =
    prompt.toolName === 'AskUserQuestion' || prompt.toolName === 'ask_user' ? (
      <AskUserQuestionCard
        questions={parseQuestions(prompt.input)}
        submitting={busy}
        onSubmit={(answers, response) => onAnswer?.(prompt, answers, response)}
        onDismiss={onSkip ? () => onSkip(prompt) : undefined}
      />
    ) : prompt.toolName === 'ExitPlanMode' ? (
      <ExitPlanModeCard
        plan={extractPlan(prompt.input)}
        submitting={busy}
        followUps={planFollowUps ?? []}
        followUpsLoading={planFollowUpsLoading}
        onSelectFollowUp={(followUp) => onSelectPlanFollowUp?.(prompt, followUp)}
      />
    ) : (
      <ToolPermissionCard
        request={prompt}
        submitting={busy}
        onAllow={() => onAllow?.(prompt)}
        onDeny={() => onDeny?.(prompt)}
      />
    );

  return <FocusablePermissionShell highlight={Boolean(highlight)}>{card}</FocusablePermissionShell>;
}
