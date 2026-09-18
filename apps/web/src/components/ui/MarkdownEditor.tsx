// Out of scope for this component: image paste/drop upload, @/# autocomplete, syntax
// highlighting in Write mode, Tab-key list indent/outdent, the full GitHub shortcut set
// beyond Bold/Italic/Link, and a controlled `mode` prop.
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import {
  Box,
  FormControl,
  FormHelperText,
  FormLabel,
  InputBase,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import { MarkdownContent } from '../chat/MarkdownContent';
import { MarkdownEditorToolbar } from './MarkdownEditorToolbar';
import { MARKDOWN_ACTION_TRANSFORMS, resolveToolbarGroups, type MarkdownToolbarActionId } from './markdownEditorActions';
import { createHistory, isContinuousEdit, recordEdit, redo, undo, type MarkdownHistoryState } from './markdownHistory';
import { continueListOnEnter, previewMinHeight, type MarkdownTransform } from './markdownTransforms';

export interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  minRows?: number;
  maxRows?: number;
  disabled?: boolean;
  required?: boolean;
  helperText?: string;
  error?: boolean;
  monospace?: boolean;
  initialMode?: 'write' | 'preview';
  hideToolbar?: boolean;
  hidePreview?: boolean;
  toolbarActions?: MarkdownToolbarActionId[];
  previewEmptyText?: string;
  autoFocus?: boolean;
  id?: string;
  name?: string;
  onBlur?: () => void;
  onKeyDown?: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  'aria-label'?: string;
  sx?: object;
  ref?: React.Ref<HTMLTextAreaElement>;
}

const MONOSPACE_FONT = '"IBM Plex Mono", monospace';

export function MarkdownEditor({
  value,
  onChange,
  label,
  placeholder,
  minRows = 6,
  maxRows,
  disabled,
  required,
  helperText,
  error,
  monospace,
  initialMode = 'preview',
  hideToolbar,
  hidePreview,
  toolbarActions,
  previewEmptyText = 'Nothing to preview.',
  autoFocus,
  id,
  name,
  onBlur,
  onKeyDown,
  'aria-label': ariaLabel,
  sx,
  ref,
}: MarkdownEditorProps) {
  const generatedId = useId();
  const helperTextId = useId();
  const inputId = id ?? generatedId;
  const [mode, setMode] = useState<'write' | 'preview'>(hidePreview ? 'write' : initialMode);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const pendingSelection = useRef<{ start: number; end: number } | null>(null);
  const valueRef = useRef(value);
  valueRef.current = value;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const initialValueRef = useRef(value);
  const historyRef = useRef<MarkdownHistoryState>(
    createHistory({ value, selectionStart: value.length, selectionEnd: value.length }),
  );
  const lastEditTimeRef = useRef<number | null>(null);

  const recordChange = useCallback(
    (entry: { value: string; selectionStart: number; selectionEnd: number }, coalesce: boolean) => {
      historyRef.current = recordEdit(historyRef.current, entry, coalesce);
      onChangeRef.current(entry.value);
    },
    [],
  );

  const performUndo = useCallback(() => {
    const next = undo(historyRef.current);
    if (!next) return;
    historyRef.current = next;
    lastEditTimeRef.current = null;
    pendingSelection.current = { start: next.present.selectionStart, end: next.present.selectionEnd };
    onChangeRef.current(next.present.value);
  }, []);

  const performRedo = useCallback(() => {
    const next = redo(historyRef.current);
    if (!next) return;
    historyRef.current = next;
    lastEditTimeRef.current = null;
    pendingSelection.current = { start: next.present.selectionStart, end: next.present.selectionEnd };
    onChangeRef.current(next.present.value);
  }, []);

  const revertToInitial = useCallback(() => {
    const initial = initialValueRef.current;
    historyRef.current = createHistory({ value: initial, selectionStart: initial.length, selectionEnd: initial.length });
    lastEditTimeRef.current = null;
    pendingSelection.current = { start: initial.length, end: initial.length };
    onChangeRef.current(initial);
  }, []);

  const setRefs = useCallback(
    (el: HTMLTextAreaElement | null) => {
      inputRef.current = el;
      if (typeof ref === 'function') ref(el);
      else if (ref) (ref as React.RefObject<HTMLTextAreaElement | null>).current = el;
    },
    [ref],
  );

  const applyTransform = useCallback(
    (transform: MarkdownTransform) => {
      const el = inputRef.current;
      const currentValue = valueRef.current;
      const current = el
        ? {
            value: currentValue,
            selectionStart: el.selectionStart ?? currentValue.length,
            selectionEnd: el.selectionEnd ?? currentValue.length,
          }
        : { value: currentValue, selectionStart: currentValue.length, selectionEnd: currentValue.length };
      const result = transform(current);
      pendingSelection.current = { start: result.selectionStart, end: result.selectionEnd };
      lastEditTimeRef.current = null;
      recordChange({ value: result.value, selectionStart: result.selectionStart, selectionEnd: result.selectionEnd }, false);
    },
    [recordChange],
  );

  useLayoutEffect(() => {
    const pending = pendingSelection.current;
    const el = inputRef.current;
    if (pending && el) {
      el.focus();
      el.setSelectionRange(pending.start, pending.end);
      pendingSelection.current = null;
    }
  });

  const previousModeRef = useRef(mode);
  useEffect(() => {
    if (mode === 'write' && previousModeRef.current !== 'write') {
      inputRef.current?.focus();
    }
    previousModeRef.current = mode;
  }, [mode]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      const isMod = event.metaKey || event.ctrlKey;

      if (event.key === 'Escape' && !isMod && !event.shiftKey && !event.altKey) {
        const hasChanges = valueRef.current !== initialValueRef.current;
        if (hasChanges || !hidePreview) {
          event.preventDefault();
          if (hasChanges) revertToInitial();
          if (!hidePreview) setMode('preview');
          onKeyDown?.(event);
          return;
        }
      }

      if (isMod && !event.altKey) {
        const key = event.key.toLowerCase();
        if (!event.shiftKey && key === 'b') {
          event.preventDefault();
          applyTransform(MARKDOWN_ACTION_TRANSFORMS.bold);
          onKeyDown?.(event);
          return;
        }
        if (!event.shiftKey && key === 'i') {
          event.preventDefault();
          applyTransform(MARKDOWN_ACTION_TRANSFORMS.italic);
          onKeyDown?.(event);
          return;
        }
        if (!event.shiftKey && key === 'k') {
          event.preventDefault();
          applyTransform(MARKDOWN_ACTION_TRANSFORMS.link);
          onKeyDown?.(event);
          return;
        }
        if (!event.shiftKey && key === 'z') {
          event.preventDefault();
          performUndo();
          onKeyDown?.(event);
          return;
        }
        if (event.shiftKey && key === 'z') {
          event.preventDefault();
          performRedo();
          onKeyDown?.(event);
          return;
        }
      }

      if (event.key === 'Enter' && !event.shiftKey && !isMod && !event.altKey) {
        const el = event.currentTarget;
        const result = continueListOnEnter({
          value: el.value,
          selectionStart: el.selectionStart ?? 0,
          selectionEnd: el.selectionEnd ?? 0,
        });
        if (result) {
          event.preventDefault();
          pendingSelection.current = { start: result.selectionStart, end: result.selectionEnd };
          lastEditTimeRef.current = null;
          recordChange({ value: result.value, selectionStart: result.selectionStart, selectionEnd: result.selectionEnd }, false);
          onKeyDown?.(event);
          return;
        }
      }

      onKeyDown?.(event);
    },
    [applyTransform, performRedo, performUndo, recordChange, revertToInitial, hidePreview, onKeyDown],
  );

  const groups = useMemo(() => resolveToolbarGroups(toolbarActions), [toolbarActions]);
  const handleToolbarAction = useCallback(
    (actionId: MarkdownToolbarActionId) => applyTransform(MARKDOWN_ACTION_TRANSFORMS[actionId]),
    [applyTransform],
  );
  const monospaceSx = monospace ? { fontFamily: MONOSPACE_FONT } : {};

  return (
    <FormControl fullWidth error={error} required={required} disabled={disabled} sx={sx}>
      {label ? (
        <FormLabel htmlFor={inputId} sx={{ mb: 0.5 }}>
          {label}
        </FormLabel>
      ) : null}
      <Box
        sx={{
          border: 1,
          borderColor: error ? 'error.main' : 'divider',
          borderRadius: 1,
          overflow: 'hidden',
          '&:focus-within': {
            borderColor: error ? 'error.main' : 'primary.main',
          },
        }}
      >
        {(!hideToolbar || !hidePreview) && (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              flexWrap: 'wrap',
              rowGap: 0.5,
              px: 1,
              py: 0.5,
              bgcolor: 'action.hover',
              borderBottom: 1,
              borderColor: 'divider',
            }}
          >
            {!hideToolbar && (
              <MarkdownEditorToolbar
                groups={groups}
                disabled={disabled || mode === 'preview'}
                onAction={handleToolbarAction}
                canUndo={historyRef.current.past.length > 0}
                canRedo={historyRef.current.future.length > 0}
                onUndo={performUndo}
                onRedo={performRedo}
              />
            )}
            {!hidePreview && (
              <ToggleButtonGroup
                size="small"
                exclusive
                value={mode}
                onChange={(_, next: 'write' | 'preview' | null) => {
                  if (next) setMode(next);
                }}
                aria-label="Editor mode"
                disabled={disabled}
                sx={{
                  ml: 'auto',
                  flexShrink: 0,
                  '& .MuiToggleButton-root': {
                    px: 1.1,
                    py: 0.25,
                    textTransform: 'none',
                    fontSize: 12.5,
                    lineHeight: 1.35,
                  },
                }}
              >
                <ToggleButton value="write" title="Write">
                  Write
                </ToggleButton>
                <ToggleButton value="preview" title="Preview">
                  Preview
                </ToggleButton>
              </ToggleButtonGroup>
            )}
          </Box>
        )}

        {mode === 'write' ? (
          <InputBase
            inputRef={setRefs}
            id={inputId}
            name={name}
            multiline
            fullWidth
            minRows={minRows}
            maxRows={maxRows}
            value={value}
            placeholder={placeholder}
            disabled={disabled}
            required={required}
            autoFocus={autoFocus}
            onChange={(event) => {
              const el = event.target;
              const prevValue = valueRef.current;
              const nextValue = el.value;
              const now = Date.now();
              const elapsed = lastEditTimeRef.current == null ? Infinity : now - lastEditTimeRef.current;
              const coalesce = isContinuousEdit(prevValue, nextValue, elapsed);
              lastEditTimeRef.current = now;
              recordChange(
                {
                  value: nextValue,
                  selectionStart: el.selectionStart ?? nextValue.length,
                  selectionEnd: el.selectionEnd ?? nextValue.length,
                },
                coalesce,
              );
            }}
            onKeyDown={handleKeyDown}
            onBlur={onBlur}
            aria-label={ariaLabel ?? label}
            aria-describedby={helperText ? helperTextId : undefined}
            sx={{
              px: 1.5,
              py: 1,
              fontSize: '0.9375rem',
              alignItems: 'flex-start',
              ...monospaceSx,
            }}
          />
        ) : (
          <Box
            onClick={() => {
              if (!disabled) setMode('write');
            }}
            sx={{
              px: 1.5,
              py: 1,
              minHeight: previewMinHeight(minRows),
              cursor: disabled ? 'default' : 'text',
              ...monospaceSx,
            }}
          >
            {value.trim() ? (
              <MarkdownContent content={value} />
            ) : (
              <Box component="span" sx={{ color: 'text.secondary' }}>
                {previewEmptyText}
              </Box>
            )}
          </Box>
        )}
      </Box>
      {helperText ? <FormHelperText id={helperTextId}>{helperText}</FormHelperText> : null}
    </FormControl>
  );
}
