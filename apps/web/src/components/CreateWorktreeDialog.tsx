import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Alert,
  Button,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  IconButton,
  InputLabel,
  MenuItem,
  Radio,
  RadioGroup,
  Select,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from '@mui/material';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CLAUDE_MODELS,
  DEFAULT_EFFORT_LEVEL,
  DEFAULT_PERMISSION_MODE,
  FROM_GOAL_PROFILE_NAME,
  type EffortLevel,
  type PermissionMode,
} from '@agent-orchestrator/shared';
import { api } from '../api/client';
import { PullRequestPicker } from './pr/PullRequestPicker';
import { CreateWorktreeIssueFields, CreateWorktreePlannerFields } from './CreateWorktreePlannerFields';
import { ControlTooltip } from './ui/ControlTooltip';
import { ResponsiveDialog } from './ui/ResponsiveDialog';
import { ComposerPendingAttachments } from './chat/ComposerPendingAttachments';
import { MentionMenu } from './chat/MentionMenu';
import { useComposerImages } from './chat/useComposerImages';
import { useComposerMentions } from './chat/useComposerMentions';

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
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'branch' | 'pr' | 'goal' | 'issue'>('goal');
  const [branchMode, setBranchMode] = useState<'existing' | 'new'>('existing');
  const [selectedBranch, setSelectedBranch] = useState('');
  const [newBranchName, setNewBranchName] = useState('');
  const [baseBranch, setBaseBranch] = useState('');
  const [goalText, setGoalText] = useState('');
  const [issueModel, setIssueModel] = useState<string>(CLAUDE_MODELS[0].id);
  const [issueEffort, setIssueEffort] = useState<EffortLevel>(DEFAULT_EFFORT_LEVEL);
  const [issuePermissionMode, setIssuePermissionMode] =
    useState<PermissionMode>(DEFAULT_PERMISSION_MODE);
  const [selectedPr, setSelectedPr] = useState<number | ''>('');
  const [issueReference, setIssueReference] = useState('');
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

  const fromGoalProfileQuery = useQuery({
    queryKey: ['session-profiles'],
    queryFn: api.listSessionProfiles,
    enabled: open && tab === 'goal',
    select: (profiles) => profiles.find((item) => item.name === FROM_GOAL_PROFILE_NAME) ?? null,
  });

  const branchesQuery = useQuery({
    queryKey: ['branches', workspaceId],
    queryFn: () => api.listBranches(workspaceId),
    enabled: open && tab === 'branch',
  });

  const resolvedDefaultBranch =
    baseBranch || defaultBranch || workspaceQuery.data?.defaultBranch || '';

  const invalidateAfterCreate = () => {
    queryClient.invalidateQueries({ queryKey: ['worktrees', workspaceId] });
    queryClient.invalidateQueries({ queryKey: ['workspaces'] });
    queryClient.invalidateQueries({ queryKey: ['sidebar'] });
  };

  const resetForm = () => {
    setTab('goal');
    setBranchMode('existing');
    setSelectedBranch('');
    setNewBranchName('');
    setBaseBranch('');
    setGoalText('');
    setIssueModel(CLAUDE_MODELS[0].id);
    setIssueEffort(DEFAULT_EFFORT_LEVEL);
    setIssuePermissionMode(DEFAULT_PERMISSION_MODE);
    setSelectedPr('');
    setIssueReference('');
    clearImages();
    clearMentions();
  };

  const handleClose = () => {
    resetForm();
    onClose();
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
      handleClose();
      navigate(`/agents/${data.agent.id}`);
    },
  });

  const createFromPr = useMutation({
    mutationFn: () => api.createWorktreeFromPr(workspaceId, { prNumber: Number(selectedPr) }),
    onSuccess: (data) => {
      invalidateAfterCreate();
      handleClose();
      navigate(`/agents/${data.agent.id}`);
    },
  });

  const createFromGoal = useMutation({
    mutationFn: () =>
      api.createWorktreeFromGoal(workspaceId, {
        goal: buildOutgoingMessage(goalText.trim()),
        baseBranch: resolvedDefaultBranch || undefined,
      }),
    onSuccess: (data) => {
      invalidateAfterCreate();
      const initialImages = images.map((img) => ({
        ...img,
        previewUrl: `data:${img.mimeType};base64,${img.dataBase64}`,
      }));
      const initialMentions = mentions;
      handleClose();
      navigate(`/agents/${data.agent.id}`, {
        state: { initialPrompt: data.kickoffPrompt, initialImages, initialMentions },
      });
    },
  });

  const createFromIssue = useMutation({
    mutationFn: () =>
      api.createWorktreeFromIssue(workspaceId, {
        reference: issueReference.trim(),
        baseBranch: resolvedDefaultBranch || undefined,
        model: issueModel,
        effort: issueEffort,
        permissionMode: issuePermissionMode,
      }),
    onSuccess: (data) => {
      invalidateAfterCreate();
      handleClose();
      navigate(`/agents/${data.agent.id}`, {
        state: { initialPrompt: data.prompt },
      });
    },
  });

  const createPending =
    createFromBranch.isPending ||
    createFromPr.isPending ||
    createFromGoal.isPending ||
    createFromIssue.isPending;
  const createError =
    createFromBranch.error ?? createFromPr.error ?? createFromGoal.error ?? createFromIssue.error;
  const canCreateBranch =
    branchMode === 'existing' ? Boolean(selectedBranch) : Boolean(newBranchName.trim());
  const canCreate =
    tab === 'branch'
      ? canCreateBranch
      : tab === 'pr'
        ? selectedPr !== ''
        : tab === 'issue'
          ? Boolean(issueReference.trim())
          : Boolean(goalText.trim());

  const fromGoalProfile = fromGoalProfileQuery.data;

  return (
    <ResponsiveDialog open={open} onClose={handleClose} maxWidth={tab === 'pr' ? 'md' : 'sm'} fullWidth>
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
          <Tab value="branch" label="From branch" />
          <Tab value="pr" label="From PR" />
        </Tabs>

        {tab === 'goal' && (
          <Stack spacing={1.5}>
            {showMentionMenu && (
              <MentionMenu
                options={mentionOptions}
                highlight={mentionHighlight}
                onHighlight={setMentionHighlight}
                onSelect={applyMentionSelection}
              />
            )}
            <ComposerPendingAttachments
              mentions={mentions}
              images={images}
              onRemoveMention={removeMention}
              onRemoveImage={removeImage}
            />
            <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
              <ControlTooltip title="Describe what you want the agent to build or change">
                <TextField
                  label="Describe your goal"
                  value={goalText}
                  onChange={(e) => {
                    setMentionDismissed(false);
                    setGoalText(e.target.value);
                  }}
                  onPaste={(e) => {
                    const files = Array.from(e.clipboardData.files).filter((f) =>
                      f.type.startsWith('image/'),
                    );
                    if (files.length > 0) {
                      e.preventDefault();
                      void addFiles(files);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (!showMentionMenu) return;
                    if (e.key === 'ArrowDown') {
                      e.preventDefault();
                      setMentionHighlight((prev) => Math.min(prev + 1, mentionOptions.length - 1));
                      return;
                    }
                    if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      setMentionHighlight((prev) => Math.max(prev - 1, 0));
                      return;
                    }
                    if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey)) {
                      const selected = mentionOptions[mentionHighlight];
                      if (selected) {
                        e.preventDefault();
                        applyMentionSelection(selected);
                      }
                      return;
                    }
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      setMentionDismissed(true);
                    }
                  }}
                  placeholder="Add a dark mode toggle to the settings page"
                  fullWidth
                  multiline
                  minRows={4}
                  autoFocus
                />
              </ControlTooltip>
              <input
                ref={goalFileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                multiple
                hidden
                onChange={(e) => {
                  if (e.target.files) void addFiles(e.target.files);
                  e.target.value = '';
                }}
              />
              <ControlTooltip title="Attach a screenshot">
                <IconButton size="small" onClick={() => goalFileInputRef.current?.click()} aria-label="Attach a screenshot">
                  <AttachFileIcon fontSize="small" />
                </IconButton>
              </ControlTooltip>
            </Stack>
            <Typography variant="body2" color="text.secondary">
              Uses the {fromGoalProfile?.title ?? 'From goal'} session profile (
              <code>{FROM_GOAL_PROFILE_NAME}</code>
              {fromGoalProfile
                ? `: ${fromGoalProfile.model}, ${fromGoalProfile.effort}, ${fromGoalProfile.permissionMode}`
                : ''}
              ). Edit it under Session profiles. A branch name is suggested automatically. Type{' '}
              <code>@</code> to reference a repo file, or paste/attach a screenshot.
            </Typography>
          </Stack>
        )}

        {tab === 'issue' && (
          <Stack spacing={1.5}>
            <CreateWorktreeIssueFields
              issueReference={issueReference}
              placeholder={`${workspaceQuery.data?.githubOwner ?? 'owner'}/${workspaceQuery.data?.githubRepo ?? 'repo'}#149`}
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

        {tab === 'branch' && (
          <Stack spacing={2}>
            <FormControl>
              <RadioGroup
                row
                value={branchMode}
                onChange={(e) => setBranchMode(e.target.value as 'existing' | 'new')}
                sx={{
                  flexDirection: { xs: 'column', sm: 'row' },
                  '& .MuiFormControlLabel-root': { mr: { xs: 0, sm: 2 } },
                }}
              >
                <ControlTooltip title="Check out an existing branch for the new worktree">
                  <FormControlLabel value="existing" control={<Radio />} label="Existing branch" />
                </ControlTooltip>
                <ControlTooltip title="Create a new branch from a base branch">
                  <FormControlLabel value="new" control={<Radio />} label="New branch" />
                </ControlTooltip>
              </RadioGroup>
            </FormControl>

            {branchMode === 'existing' ? (
              <ControlTooltip title="Branch to check out for the new worktree">
                <FormControl fullWidth>
                  <InputLabel>Branch</InputLabel>
                  <Select
                    label="Branch"
                    value={selectedBranch}
                    onChange={(e) => setSelectedBranch(e.target.value)}
                  >
                    {branchesQuery.data?.map((branch) => (
                      <MenuItem key={branch.name} value={branch.name}>
                        {branch.name}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </ControlTooltip>
            ) : (
              <>
                <ControlTooltip title="Name for the new git branch">
                  <TextField
                    label="New branch name"
                    value={newBranchName}
                    onChange={(e) => setNewBranchName(e.target.value)}
                    placeholder="feature/my-change"
                    fullWidth
                    required
                  />
                </ControlTooltip>
                <ControlTooltip title="Branch to fork from when creating the new branch">
                  <FormControl fullWidth>
                    <InputLabel>Base branch</InputLabel>
                    <Select
                      label="Base branch"
                      value={resolvedDefaultBranch}
                      onChange={(e) => setBaseBranch(e.target.value)}
                    >
                      {branchesQuery.data?.map((branch) => (
                        <MenuItem key={branch.name} value={branch.name}>
                          {branch.name}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </ControlTooltip>
              </>
            )}
          </Stack>
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
        <ControlTooltip
          title={
            createPending
              ? tab === 'goal'
                ? 'Suggesting a branch name and creating the agent…'
                : 'Creating the agent…'
              : !canCreate
                ? 'Fill in the required fields first'
                : tab === 'goal'
                  ? 'Create agent and send your goal as the first message'
                  : tab === 'pr'
                    ? 'Create agent from the selected pull request'
                    : 'Create agent from the selected branch'
          }
          disabled={createPending || !canCreate}
        >
          <Button
            variant="contained"
            disabled={createPending || !canCreate}
            onClick={() => {
              if (tab === 'branch') createFromBranch.mutate();
              else if (tab === 'pr') createFromPr.mutate();
              else if (tab === 'issue') createFromIssue.mutate();
              else createFromGoal.mutate();
            }}
          >
            {createPending
              ? tab === 'goal'
                ? 'Suggesting & creating…'
                : 'Creating…'
              : 'Create'}
          </Button>
        </ControlTooltip>
      </DialogActions>
    </ResponsiveDialog>
  );
}
