import type { RefObject } from 'react';
import {
  Alert,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import AttachFileIcon from '@mui/icons-material/AttachFile';
import {
  CLAUDE_EFFORT_LEVELS,
  CLAUDE_MODELS,
  type AgentTask,
  type EffortLevel,
} from '@agent-orchestrator/shared';
import { ControlTooltip } from './ui/ControlTooltip';
import { ComposerPendingAttachments } from './chat/ComposerPendingAttachments';
import { MentionMenu, type MentionMenuOption } from './chat/MentionMenu';
import type { PendingImage } from './chat/composerTypes';
import type { PendingMention } from './chat/mentionComposer';

export const TASK_DEFAULT_SENTINEL = '__task_default__';

type CreateWorktreeGoalFieldsProps = {
  goalText: string;
  goalTask: string;
  goalModel: string;
  goalEffort: EffortLevel | typeof TASK_DEFAULT_SENTINEL;
  agentTasks: AgentTask[];
  mentions: PendingMention[];
  images: PendingImage[];
  mentionOptions: MentionMenuOption[];
  mentionHighlight: number;
  showMentionMenu: boolean;
  fileInputRef: RefObject<HTMLInputElement | null>;
  onGoalTextChange: (value: string) => void;
  onClearMentionDismissed: () => void;
  onDismissMentionMenu: () => void;
  onMentionHighlight: (value: number | ((prev: number) => number)) => void;
  onApplyMention: (option: MentionMenuOption) => void;
  onRemoveMention: (id: string) => void;
  onRemoveImage: (id: string) => void;
  onAddFiles: (files: FileList | File[]) => void | Promise<void>;
  onTaskChange: (taskName: string) => void;
  onModelChange: (model: string) => void;
  onEffortChange: (effort: EffortLevel | typeof TASK_DEFAULT_SENTINEL) => void;
};

export function CreateWorktreeGoalFields({
  goalText,
  goalTask,
  goalModel,
  goalEffort,
  agentTasks,
  mentions,
  images,
  mentionOptions,
  mentionHighlight,
  showMentionMenu,
  fileInputRef,
  onGoalTextChange,
  onClearMentionDismissed,
  onDismissMentionMenu,
  onMentionHighlight,
  onApplyMention,
  onRemoveMention,
  onRemoveImage,
  onAddFiles,
  onTaskChange,
  onModelChange,
  onEffortChange,
}: CreateWorktreeGoalFieldsProps) {
  const selectedGoalTask =
    goalTask === 'auto' ? null : (agentTasks.find((item) => item.name === goalTask) ?? null);

  return (
    <Stack spacing={1.5}>
      {showMentionMenu && (
        <MentionMenu
          options={mentionOptions}
          highlight={mentionHighlight}
          onHighlight={onMentionHighlight}
          onSelect={onApplyMention}
        />
      )}
      <ComposerPendingAttachments
        mentions={mentions}
        images={images}
        onRemoveMention={onRemoveMention}
        onRemoveImage={onRemoveImage}
      />
      <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
        <ControlTooltip title="Describe what you want the agent to build or change">
          <TextField
            label="Describe your goal"
            value={goalText}
            onChange={(e) => {
              onClearMentionDismissed();
              onGoalTextChange(e.target.value);
            }}
            onPaste={(e) => {
              const files = Array.from(e.clipboardData.files).filter((f) =>
                f.type.startsWith('image/'),
              );
              if (files.length > 0) {
                e.preventDefault();
                void onAddFiles(files);
              }
            }}
            onKeyDown={(e) => {
              if (!showMentionMenu) return;
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                onMentionHighlight((prev) => Math.min(prev + 1, mentionOptions.length - 1));
                return;
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault();
                onMentionHighlight((prev) => Math.max(prev - 1, 0));
                return;
              }
              if (
                e.key === 'Tab' ||
                (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey)
              ) {
                const selected = mentionOptions[mentionHighlight];
                if (selected) {
                  e.preventDefault();
                  onApplyMention(selected);
                }
                return;
              }
              if (e.key === 'Escape') {
                e.preventDefault();
                onDismissMentionMenu();
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
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files) void onAddFiles(e.target.files);
            e.target.value = '';
          }}
        />
        <ControlTooltip title="Attach a screenshot">
          <IconButton
            size="small"
            onClick={() => fileInputRef.current?.click()}
            aria-label="Attach a screenshot"
          >
            <AttachFileIcon fontSize="small" />
          </IconButton>
        </ControlTooltip>
      </Stack>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} useFlexGap sx={{ flexWrap: 'wrap' }}>
        <ControlTooltip
          title={
            selectedGoalTask?.purpose
              ? selectedGoalTask.purpose
              : 'Auto picks a task whose purpose fits the goal'
          }
        >
          <FormControl size="small" sx={{ minWidth: 160, flex: 1 }}>
            <InputLabel>Task</InputLabel>
            <Select label="Task" value={goalTask} onChange={(e) => onTaskChange(e.target.value)}>
              <MenuItem value="auto">Auto</MenuItem>
              {agentTasks.map((item) => (
                <MenuItem key={item.id} value={item.name}>
                  {item.title}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </ControlTooltip>
        <ControlTooltip title="Claude model for the first session">
          <FormControl size="small" sx={{ minWidth: 160, flex: 1 }}>
            <InputLabel>Model</InputLabel>
            <Select label="Model" value={goalModel} onChange={(e) => onModelChange(e.target.value)}>
              <MenuItem value={TASK_DEFAULT_SENTINEL}>Task default</MenuItem>
              {CLAUDE_MODELS.map((item) => (
                <MenuItem key={item.id} value={item.id}>
                  {item.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </ControlTooltip>
        <ControlTooltip title="How much reasoning effort the model should use">
          <FormControl size="small" sx={{ minWidth: 160, flex: 1 }}>
            <InputLabel>Effort</InputLabel>
            <Select
              label="Effort"
              value={goalEffort}
              onChange={(e) =>
                onEffortChange(e.target.value as EffortLevel | typeof TASK_DEFAULT_SENTINEL)
              }
            >
              <MenuItem value={TASK_DEFAULT_SENTINEL}>Task default</MenuItem>
              {CLAUDE_EFFORT_LEVELS.map((item) => (
                <MenuItem key={item.id} value={item.id}>
                  {item.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </ControlTooltip>
      </Stack>
      {agentTasks.length === 0 ? (
        <Alert severity="info">
          No tasks yet. Create one under Tasks so From goal can run (Auto needs a purpose).
        </Alert>
      ) : null}
      <Typography variant="body2" color="text.secondary">
        Type <code>@</code> to reference a repo file, or paste/attach a screenshot.
      </Typography>
    </Stack>
  );
}
