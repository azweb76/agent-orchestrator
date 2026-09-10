import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

export interface BrainCrudApi<T, C, U> {
  formOpen: boolean;
  editing: T | null;
  saving: boolean;
  saveError: string | null;
  openCreate: () => void;
  openEdit: (entity: T) => void;
  closeForm: () => void;
  save: (body: C | U) => void;
  deleteTarget: T | null;
  deleting: boolean;
  deleteError: string | null;
  askDelete: (entity: T) => void;
  cancelDelete: () => void;
  confirmDelete: () => void;
}

/**
 * Form + delete state and mutations shared by the four Brain entity panels. Panels keep
 * their own list rendering and dialog choice; only this state machine is shared.
 *
 * Deliberately built-in agnostic: name locking is per-field and lives in the dialogs, and
 * delete blocking lives on the row (with the server as the backstop).
 */
export function useBrainCrud<T, C, U>(options: {
  queryKey: readonly unknown[];
  /** Slug or id used as the update/delete path segment. */
  identify: (entity: T) => string;
  create: (body: C) => Promise<unknown>;
  update: (id: string, body: U) => Promise<unknown>;
  remove: (id: string) => Promise<unknown>;
}): BrainCrudApi<T, C, U> {
  const { queryKey, identify, create, update, remove } = options;
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<T | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<T | null>(null);

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey }),
      // The library repo projection changes with every write, so the sync bar's
      // modified-file count would otherwise go stale.
      queryClient.invalidateQueries({ queryKey: ['brain-sync'] }),
    ]);
  };

  const saveMutation = useMutation({
    mutationFn: (body: C | U) =>
      editing ? update(identify(editing), body as U) : create(body as C),
    onSuccess: async () => {
      await invalidate();
      setFormOpen(false);
      setEditing(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (entity: T) => remove(identify(entity)),
    onSuccess: async () => {
      await invalidate();
      setDeleteTarget(null);
    },
  });

  return {
    formOpen,
    editing,
    saving: saveMutation.isPending,
    saveError: saveMutation.error ? (saveMutation.error as Error).message : null,
    openCreate: () => {
      saveMutation.reset();
      setEditing(null);
      setFormOpen(true);
    },
    openEdit: (entity) => {
      saveMutation.reset();
      setEditing(entity);
      setFormOpen(true);
    },
    closeForm: () => {
      setFormOpen(false);
      setEditing(null);
    },
    save: (body) => saveMutation.mutate(body),
    deleteTarget,
    deleting: deleteMutation.isPending,
    deleteError: deleteMutation.error ? (deleteMutation.error as Error).message : null,
    askDelete: (entity) => {
      deleteMutation.reset();
      setDeleteTarget(entity);
    },
    cancelDelete: () => setDeleteTarget(null),
    confirmDelete: () => {
      if (deleteTarget) deleteMutation.mutate(deleteTarget);
    },
  };
}
