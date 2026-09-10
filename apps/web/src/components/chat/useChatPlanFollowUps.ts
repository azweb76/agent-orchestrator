import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { extractPlanFromInput, type PermissionRequest } from '@agent-orchestrator/shared';
import { api } from '../../api/client';
import type { PermissionPrompt, PlanFollowUp } from '../claude-chat/types';
import { buildFollowUpPlanOverride, toPlanFollowUps } from './planFollowUps';

interface UseChatPlanFollowUpsOptions {
  active: boolean;
  archived: boolean;
  permissionRequests: PermissionRequest[];
  buildPlan: (request: PermissionRequest, setPermissionBusy: (v: boolean) => void) => Promise<void>;
  setPermissionBusy: (v: boolean) => void;
  keepPlanning: (
    request: PermissionRequest,
    abortSession: (sid: string) => void,
    onError?: (message: string) => void,
  ) => Promise<void>;
  abortSession: (sid: string) => void;
  onError?: (message: string) => void;
}

/**
 * Fetches the plan-time follow-up catalog and wires selection back through the
 * existing Build flow (never a raw permission allow — ExitPlanMode must always
 * hit Build to avoid the CLI stdio hang). Also exposes `onDenyPermission`, which
 * the ExitPlanMode card uses for its "Keep planning" button.
 */
export function useChatPlanFollowUps({
  active,
  archived,
  permissionRequests,
  buildPlan,
  setPermissionBusy,
  keepPlanning,
  abortSession,
  onError,
}: UseChatPlanFollowUpsOptions) {
  const hasExitPlanModePrompt = permissionRequests.some((item) => item.toolName === 'ExitPlanMode');
  const query = useQuery({
    queryKey: ['plan-follow-ups'],
    queryFn: () => api.listPlanFollowUps(),
    enabled: active && !archived && hasExitPlanModePrompt,
  });

  const planFollowUps = useMemo(() => toPlanFollowUps(query.data ?? []), [query.data]);

  const findRequest = (prompt: PermissionPrompt) =>
    permissionRequests.find((item) => item.requestId === prompt.id);

  const onApprovePlan = (prompt: PermissionPrompt) => {
    const request = findRequest(prompt);
    if (request) void buildPlan(request, setPermissionBusy);
  };

  const onSelectPlanFollowUp = (prompt: PermissionPrompt, followUp: PlanFollowUp) => {
    const request = findRequest(prompt);
    if (!request) return;
    const plan = extractPlanFromInput(request.input);
    const override = buildFollowUpPlanOverride(plan, followUp);
    const target: PermissionRequest = override
      ? { ...request, input: { ...request.input, plan: override } }
      : request;
    void buildPlan(target, setPermissionBusy);
  };

  const onDenyPermission = (prompt: PermissionPrompt) => {
    const request = findRequest(prompt);
    if (request) void keepPlanning(request, abortSession, onError);
  };

  return {
    planFollowUps,
    planFollowUpsLoading: query.isLoading,
    onApprovePlan,
    onSelectPlanFollowUp,
    onDenyPermission,
  };
}
