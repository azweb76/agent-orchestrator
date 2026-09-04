import { ConfirmDialog } from './ConfirmDialog';

type CreateAgentOverwriteConfirmProps = {
  branch: string | null;
  baseBranch: string;
  loading: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

/** Confirm resetting an existing local branch when create-agent hits BRANCH_EXISTS. */
export function CreateAgentOverwriteConfirm({
  branch,
  baseBranch,
  loading,
  onCancel,
  onConfirm,
}: CreateAgentOverwriteConfirmProps) {
  return (
    <ConfirmDialog
      open={Boolean(branch)}
      title="Overwrite existing branch?"
      description={
        branch
          ? `Branch "${branch}" already exists. Overwrite it from ${baseBranch || 'the base branch'} and create a new worktree?`
          : ''
      }
      confirmLabel="Overwrite"
      confirmColor="warning"
      loading={loading}
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  );
}
