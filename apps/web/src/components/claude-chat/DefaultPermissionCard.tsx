import { FocusablePermissionShell } from './permissions/FocusablePermissionShell';
import { AskUserQuestionCard } from './permissions/AskUserQuestionCard';
import { ExitPlanModeCard } from './permissions/ExitPlanModeCard';
import { ToolPermissionCard } from './permissions/ToolPermissionCard';
import { parseQuestions } from './parseQuestions';
import type { ClaudeChatProps, PermissionPrompt } from './types';

function extractPlan(input: Record<string, unknown>): string {
  return typeof input.plan === 'string' ? input.plan : '';
}

export function DefaultPermissionCard({
  prompt,
  busy,
  highlight,
  onAllow,
  onDeny,
  onAnswer,
  onSkip,
  onApprovePlan,
  onKeepPlanning,
  onDenyPlan,
}: {
  prompt: PermissionPrompt;
  busy?: boolean;
  highlight?: boolean;
  onAllow?: ClaudeChatProps['onAllowPermission'];
  onDeny?: ClaudeChatProps['onDenyPermission'];
  onAnswer?: ClaudeChatProps['onAnswerQuestions'];
  onSkip?: ClaudeChatProps['onSkipQuestions'];
  onApprovePlan?: ClaudeChatProps['onApprovePlan'];
  onKeepPlanning?: ClaudeChatProps['onKeepPlanning'];
  onDenyPlan?: ClaudeChatProps['onDenyPlan'];
}) {
  const card =
    prompt.toolName === 'AskUserQuestion' ? (
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
        onApprove={() => onApprovePlan?.(prompt)}
        onKeepPlanning={() => onKeepPlanning?.(prompt)}
        onDeny={onDenyPlan ? () => onDenyPlan(prompt) : undefined}
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
