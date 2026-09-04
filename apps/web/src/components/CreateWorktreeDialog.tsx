import { useRef, useState } from 'react';
import {
  Alert,
  Button,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Tab,
  Tabs,
} from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import {
  CLAUDE_MODELS,
  DEFAULT_EFFORT_LEVEL,
  DEFAULT_PERMISSION_MODE,
  type EffortLevel,
  type PermissionMode,
} from '@agent-orchestrator/shared';
import { api } from '../api/client';
import { PullRequestPicker } from './pr/PullRequestPicker';
import { JiraIssuePicker } from './jira/JiraIssuePicker';
import { CreateWorktreeBranchFields } from './CreateWorktreeBranchFields';
import { CreateWorktreeIssueFields, CreateWorktreePlannerFields } from './CreateWorktreePlannerFields';
import {
  CreateWorktreeGoalFields,
  TASK_DEFAULT_SENTINEL,
} from './CreateWorktreeGoalFields';
import {
  AUTO_BRANCH_NAME,
  CreateWorktreeNameField,
} from './CreateWorktreeNameField';
import { useCreateWorktreeMutations } from './useCreateWorktreeMutations';
import { ControlTooltip } from './ui/ControlTooltip';
import { ResponsiveDialog } from './ui/ResponsiveDialog';
import { useComposerImages } from './chat/useComposerImages';
import { useComposerMentions } from './chat/useComposerMentions';

type CreateTab = 'branch' | 'pr' | 'goal' | 'issue' | 'jira';

interface CreateWorktreeDialogProps {
  open: boolean;
  onClose: () => void;
  workspaceId: string;
  defaultBranch?: string;
}

export function CreateWorktreeDialog({
  open,
  onClose,
  workspaceId,
  defaultBranch = '',
}: CreateWorktreeDialogProps) {
  const [tab, setTab] = useState<CreateTab>('goal');
  const [branchMode, setBranchMode] = useState<'existing' | 'new'>('existing');
  const [selectedBranch, setSelectedBranch] = useState('');
  const [newBranchName, setNewBranchName] = useState('');
  const [worktreeBranchName, setWorktreeBranchName] = useState(AUTO_BRANCH_NAME);
  const [baseBranch, setBaseBranch] = useState('');
  const [goalText, setGoalText] = useState('');
  const [goalTask, setGoalTask] = useState<string>('auto');
  const [goalModel, setGoalModel] = useState<string>(TASK_DEFAULT_SENTINEL);
  const [goalEffort, setGoalEffort] = useState<EffortLevel | typeof TASK_DEFAULT_SENTINEL>(
    TASK_DEFAULT_SENTINEL,
  );
  const [issueModel, setIssueModel] = useState<string>(CLAUDE_MODELS[0].id);
  const [issueEffort, setIssueEffort] = useState<EffortLevel>(DEFAULT_EFFORT_LEVEL);
  const [issuePermissionMode, setIssuePermissionMode] =
    useState<PermissionMode>(DEFAULT_PERMISSION_MODE);
  const [selectedPr, setSelectedPr] = useState<number | ''>('');
  const [issueReference, setIssueReference] = useState('');
  const [jiraIssueKey, setJiraIssueKey] = useState('');
  const goalFileInputRef = useRef<HTMLInputElement>(null);

  const { images, clearImages, addFiles, removeImage } = useComposerImages();
  const goalMentionFilesQuery = useQuery({
    queryKey: ['workspace-mention-files', workspaceId],
    queryFn: () => api.listWorkspaceMentionFiles(workspaceId),
    enabled: open && tab === 'goal',
    staleTime: 60_000,
  });
  const {
    mentions,
    mentionHighlight,
    mentionOptions,
    showMentionMenu,
    setMentionDismissed,
    setMentionHighlight,
    clearMentions,
    removeMention,
    applyMentionSelection,
    buildOutgoingMessage,
  } = useComposerMentions(goalMentionFilesQuery.data, goalText, setGoalText);

  const workspaceQuery = useQuery({
    queryKey: ['workspace', workspaceId],
    queryFn: () => api.getWorkspace(workspaceId),
    enabled: open && Boolean(workspaceId),
  });

  const agentTasksQuery = useQuery({
    queryKey: ['agent-tasks'],
    queryFn: api.listAgentTasks,
    enabled: open && tab === 'goal',
  });

  const branchesQuery = useQuery({
    queryKey: ['branches', workspaceId],
    queryFn: () => api.listBranches(workspaceId),
    enabled: open && tab === 'branch',
  });

  const resolvedDefaultBranch =
    baseBranch || defaultBranch || workspaceQuery.data?.defaultBranch || '';

  const resetForm = () => {
    setTab('goal');
    setBranchMode('existing');
    setSelectedBranch('');
    setNewBranchName('');
    setWorktreeBranchName(AUTO_BRANCH_NAME);
    setBaseBranch('');
    setGoalText('');
    setGoalTask('auto');
    setGoalModel(TASK_DEFAULT_SENTINEL);
    setGoalEffort(TASK_DEFAULT_SENTINEL);
    setIssueModel(CLAUDE_MODELS[0].id);
    setIssueEffort(DEFAULT_EFFORT_LEVEL);
    setIssuePermissionMode(DEFAULT_PERMISSION_MODE);
    setSelectedPr('');
    setIssueReference('');
    setJiraIssueKey('');
    clearImages();
    clearMentions();
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const {
    createFromBranch,
    createFromPr,
    createFromGoal,
    createFromIssue,
    createFromJira,
    createPending,
    createError,
  } = useCreateWorktreeMutations(
    {
      workspaceId,
      resolvedDefaultBranch,
      branchMode,
      selectedBranch,
      newBranchName,
      worktreeBranchName,
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
    },
    { onCloseForm: handleClose },
  );

  const canCreateBranch =
    branchMode === 'existing' ? Boolean(selectedBranch) : Boolean(newBranchName.trim());
  const canCreate =
    tab === 'branch'
      ? canCreateBranch
      : tab === 'pr'
        ? selectedPr !== ''
        : tab === 'issue'
          ? Boolean(issueReference.trim())
          : tab === 'jira'
            ? Boolean(jiraIssueKey.trim())
            : Boolean(goalText.trim()) && Boolean(goalTask);

  const agentTasks = agentTasksQuery.data ?? [];

  const applyTaskDefaults = (taskName: string) => {
    setGoalTask(taskName);
    if (taskName === 'auto') {
      setGoalModel(TASK_DEFAULT_SENTINEL);
      setGoalEffort(TASK_DEFAULT_SENTINEL);
      return;
    }
    const task = agentTasks.find((item) => item.name === taskName);
    if (task) {
      setGoalModel(task.model);
      setGoalEffort(task.effort);
    } else {
      setGoalModel(TASK_DEFAULT_SENTINEL);
      setGoalEffort(TASK_DEFAULT_SENTINEL);
    }
  };

  const createTooltip =
    createPending
      ? tab === 'goal' || tab === 'issue' || tab === 'jira'
        ? worktreeBranchName.trim().toLowerCase() === 'auto' || !worktreeBranchName.trim()
          ? 'Suggesting a branch name and creating the agent…'
          : 'Creating the agent…'
        : 'Creating the agent…'
      : !canCreate
        ? 'Fill in the required fields first'
        : tab === 'goal'
          ? 'Create agent and send your goal as the first message'
          : tab === 'pr'
            ? 'Create agent from the selected pull request'
            : tab === 'jira'
              ? 'Create agent from the selected Jira issue'
              : tab === 'issue'
                ? 'Create agent from the GitHub or Jira issue reference'
                : 'Create agent from the selected branch';

  const showBranchNameField = tab === 'goal' || tab === 'issue' || tab === 'jira';
  const creatingWithSuggest =
    createPending &&
    showBranchNameField &&
    (worktreeBranchName.trim().toLowerCase() === 'auto' || !worktreeBranchName.trim());

  return (
    <ResponsiveDialog
      open={open}
      onClose={handleClose}
      maxWidth={tab === 'pr' || tab === 'jira' ? 'md' : 'sm'}
      fullWidth
    >
      <DialogTitle>Create agent</DialogTitle>
      <DialogContent>
        <Tabs
          value={tab}
          onChange={(_, value) => setTab(value)}
          variant="scrollable"
          scrollButtons="auto"
          allowScrollButtonsMobile
          sx={{ mb: 2 }}
        >
          <Tab value="goal" label="From goal" />
          <Tab value="issue" label="From issue" />
          <Tab value="jira" label="From Jira" />
          <Tab value="branch" label="From branch" />
          <Tab value="pr" label="From PR" />
        </Tabs>

        {tab === 'goal' && (
          <CreateWorktreeGoalFields
            goalText={goalText}
            goalTask={goalTask}
            goalModel={goalModel}
            goalEffort={goalEffort}
            agentTasks={agentTasks}
            mentions={mentions}
            images={images}
            mentionOptions={mentionOptions}
            mentionHighlight={mentionHighlight}
            showMentionMenu={showMentionMenu}
            fileInputRef={goalFileInputRef}
            onGoalTextChange={setGoalText}
            onClearMentionDismissed={() => setMentionDismissed(false)}
            onDismissMentionMenu={() => setMentionDismissed(true)}
            onMentionHighlight={setMentionHighlight}
            onApplyMention={applyMentionSelection}
            onRemoveMention={removeMention}
            onRemoveImage={removeImage}
            onAddFiles={addFiles}
            onTaskChange={applyTaskDefaults}
            onModelChange={setGoalModel}
            onEffortChange={setGoalEffort}
          />
        )}

        {tab === 'issue' && (
          <Stack spacing={1.5}>
            <CreateWorktreeIssueFields
              issueReference={issueReference}
              placeholder={`${workspaceQuery.data?.githubOwner ?? 'owner'}/${workspaceQuery.data?.githubRepo ?? 'repo'}#149 or PROJ-123`}
              onIssueReferenceChange={setIssueReference}
            />
            <CreateWorktreePlannerFields
              model={issueModel}
              effort={issueEffort}
              permissionMode={issuePermissionMode}
              onModelChange={setIssueModel}
              onEffortChange={setIssueEffort}
              onPermissionModeChange={setIssuePermissionMode}
            />
          </Stack>
        )}

        {tab === 'jira' && (
          <Stack spacing={1.5}>
            <JiraIssuePicker
              workspaceId={workspaceId}
              selectedKey={jiraIssueKey}
              onSelect={setJiraIssueKey}
              enabled={open && tab === 'jira'}
            />
            <CreateWorktreePlannerFields
              model={issueModel}
              effort={issueEffort}
              permissionMode={issuePermissionMode}
              onModelChange={setIssueModel}
              onEffortChange={setIssueEffort}
              onPermissionModeChange={setIssuePermissionMode}
            />
          </Stack>
        )}

        {showBranchNameField && (
          <Stack sx={{ mt: 1.5 }}>
            <CreateWorktreeNameField
              value={worktreeBranchName}
              onChange={setWorktreeBranchName}
            />
          </Stack>
        )}

        {tab === 'branch' && (
          <CreateWorktreeBranchFields
            branchMode={branchMode}
            selectedBranch={selectedBranch}
            newBranchName={newBranchName}
            baseBranch={resolvedDefaultBranch}
            branches={branchesQuery.data ?? []}
            onBranchModeChange={setBranchMode}
            onSelectedBranchChange={setSelectedBranch}
            onNewBranchNameChange={setNewBranchName}
            onBaseBranchChange={setBaseBranch}
          />
        )}

        {tab === 'pr' && (
          <PullRequestPicker
            workspaceId={workspaceId}
            owner={workspaceQuery.data?.githubOwner ?? ''}
            repo={workspaceQuery.data?.githubRepo ?? ''}
            selectedPr={selectedPr}
            onSelect={setSelectedPr}
            onView={handleClose}
          />
        )}

        {createError && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {(createError as Error).message}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <ControlTooltip title="Discard and close without creating an agent">
          <Button onClick={handleClose}>Cancel</Button>
        </ControlTooltip>
        <ControlTooltip title={createTooltip} disabled={createPending || !canCreate}>
          <Button
            variant="contained"
            disabled={createPending || !canCreate}
            onClick={() => {
              if (tab === 'branch') createFromBranch.mutate();
              else if (tab === 'pr') createFromPr.mutate();
              else if (tab === 'issue') createFromIssue.mutate();
              else if (tab === 'jira') createFromJira.mutate();
              else createFromGoal.mutate();
            }}
          >
            {createPending
              ? creatingWithSuggest
                ? 'Suggesting & creating…'
                : 'Creating…'
              : 'Create'}
          </Button>
        </ControlTooltip>
      </DialogActions>
    </ResponsiveDialog>
  );
}
