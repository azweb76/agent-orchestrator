import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  parseJiraIssueKey,
  type EffortLevel,
  type PermissionMode,
} from '@agent-orchestrator/shared';
import { api } from '../api/client';
import type { PendingImage } from './chat/composerTypes';
import type { PendingMention } from './chat/mentionComposer';
import { TASK_DEFAULT_SENTINEL } from './CreateWorktreeGoalFields';

type GoalEffort = EffortLevel | typeof TASK_DEFAULT_SENTINEL;

export type CreateWorktreeFormState = {
  workspaceId: string;
  resolvedDefaultBranch: string;
  branchMode: 'existing' | 'new';
  selectedBranch: string;
  newBranchName: string;
  selectedPr: number | '';
  goalText: string;
  goalTask: string;
  goalModel: string;
  goalEffort: GoalEffort;
  issueReference: string;
  jiraIssueKey: string;
  issueModel: string;
  issueEffort: EffortLevel;
  issuePermissionMode: PermissionMode;
  images: PendingImage[];
  mentions: PendingMention[];
  buildOutgoingMessage: (text: string) => string;
};

type FormCallbacks = {
  onCloseForm: () => void;
};

export function useCreateWorktreeMutations(
  form: CreateWorktreeFormState,
  { onCloseForm }: FormCallbacks,
) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const {
    workspaceId,
    resolvedDefaultBranch,
    branchMode,
    selectedBranch,
    newBranchName,
    selectedPr,
    goalText,
    goalTask,
    goalModel,
    goalEffort,
    issueReference,
    jiraIssueKey,
    issueModel,
    issueEffort,
    issuePermissionMode,
    images,
    mentions,
    buildOutgoingMessage,
  } = form;

  const invalidateAfterCreate = () => {
    queryClient.invalidateQueries({ queryKey: ['worktrees', workspaceId] });
    queryClient.invalidateQueries({ queryKey: ['workspaces'] });
    queryClient.invalidateQueries({ queryKey: ['sidebar'] });
  };

  const createFromBranch = useMutation({
    mutationFn: () => {
      if (branchMode === 'new') {
        return api.createWorktreeFromBranch(workspaceId, {
          branch: newBranchName,
          createNew: true,
          baseBranch: resolvedDefaultBranch || undefined,
        });
      }
      return api.createWorktreeFromBranch(workspaceId, { branch: selectedBranch });
    },
    onSuccess: (data) => {
      invalidateAfterCreate();
      onCloseForm();
      navigate(`/agents/${data.agent.id}`);
    },
  });

  const createFromPr = useMutation({
    mutationFn: () => api.createWorktreeFromPr(workspaceId, { prNumber: Number(selectedPr) }),
    onSuccess: (data) => {
      invalidateAfterCreate();
      onCloseForm();
      navigate(`/agents/${data.agent.id}`);
    },
  });

  const createFromGoal = useMutation({
    mutationFn: () =>
      api.createWorktreeFromGoal(workspaceId, {
        goal: buildOutgoingMessage(goalText.trim()),
        baseBranch: resolvedDefaultBranch || undefined,
        task: goalTask,
        ...(goalModel !== TASK_DEFAULT_SENTINEL ? { model: goalModel } : {}),
        ...(goalEffort !== TASK_DEFAULT_SENTINEL ? { effort: goalEffort } : {}),
      }),
    onSuccess: (data) => {
      invalidateAfterCreate();
      const initialImages = images.map((img) => ({
        ...img,
        previewUrl: `data:${img.mimeType};base64,${img.dataBase64}`,
      }));
      const initialMentions = mentions;
      onCloseForm();
      navigate(`/agents/${data.agent.id}`, {
        state: { initialPrompt: data.kickoffPrompt, initialImages, initialMentions },
      });
    },
  });

  const createFromIssue = useMutation({
    mutationFn: async (): Promise<{ agent: { id: string }; prompt: string }> => {
      const reference = issueReference.trim();
      const jiraKey = parseJiraIssueKey(reference);
      if (jiraKey) {
        return api.createWorktreeFromJiraIssue(workspaceId, {
          issueKey: jiraKey,
          baseBranch: resolvedDefaultBranch || undefined,
          model: issueModel,
          effort: issueEffort,
          permissionMode: issuePermissionMode,
        });
      }
      return api.createWorktreeFromIssue(workspaceId, {
        reference,
        baseBranch: resolvedDefaultBranch || undefined,
        model: issueModel,
        effort: issueEffort,
        permissionMode: issuePermissionMode,
      });
    },
    onSuccess: (data) => {
      invalidateAfterCreate();
      onCloseForm();
      navigate(`/agents/${data.agent.id}`, {
        state: { initialPrompt: data.prompt },
      });
    },
  });

  const createFromJira = useMutation({
    mutationFn: () =>
      api.createWorktreeFromJiraIssue(workspaceId, {
        issueKey: jiraIssueKey.trim(),
        baseBranch: resolvedDefaultBranch || undefined,
        model: issueModel,
        effort: issueEffort,
        permissionMode: issuePermissionMode,
      }),
    onSuccess: (data) => {
      invalidateAfterCreate();
      queryClient.invalidateQueries({ queryKey: ['jira-issues-inbox'] });
      onCloseForm();
      navigate(`/agents/${data.agent.id}`, {
        state: { initialPrompt: data.prompt },
      });
    },
  });

  return {
    createFromBranch,
    createFromPr,
    createFromGoal,
    createFromIssue,
    createFromJira,
    createPending:
      createFromBranch.isPending ||
      createFromPr.isPending ||
      createFromGoal.isPending ||
      createFromIssue.isPending ||
      createFromJira.isPending,
    createError:
      createFromBranch.error ??
      createFromPr.error ??
      createFromGoal.error ??
      createFromIssue.error ??
      createFromJira.error,
  };
}
