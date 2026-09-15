// Out of scope for this component: image paste/drop upload, @/# autocomplete, syntax
// highlighting in Write mode, Tab-key list indent/outdent, the full GitHub shortcut set
// beyond Bold/Italic/Link, a controlled `mode` prop, and preserving native undo granularity.
import { useCallback, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Box, FormControl, FormHelperText, FormLabel, InputBase, Tab, Tabs } from '@mui/material';
import { MarkdownContent } from '../chat/MarkdownContent';
import { MarkdownEditorToolbar } from './MarkdownEditorToolbar';
import { MARKDOWN_ACTION_TRANSFORMS, resolveToolbarGroups, type MarkdownToolbarActionId } from './markdownEditorActions';
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
  initialMode = 'write',
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
      onChangeRef.current(result.value);
    },
    [],
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

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      const isMod = event.metaKey || event.ctrlKey;
      if (isMod && !event.shiftKey && !event.altKey) {
        const key = event.key.toLowerCase();
        if (key === 'b') {
          event.preventDefault();
          applyTransform(MARKDOWN_ACTION_TRANSFORMS.bold);
          onKeyDown?.(event);
          return;
        }
        if (key === 'i') {
          event.preventDefault();
          applyTransform(MARKDOWN_ACTION_TRANSFORMS.italic);
          onKeyDown?.(event);
          return;
        }
        if (key === 'k') {
          event.preventDefault();
          applyTransform(MARKDOWN_ACTION_TRANSFORMS.link);
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
          onChange(result.value);
          onKeyDown?.(event);
          return;
        }
      }

      onKeyDown?.(event);
    },
    [applyTransform, onChange, onKeyDown],
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
        {!hidePreview && (
          <Tabs
            value={mode}
            onChange={(_, next) => setMode(next)}
            sx={{ minHeight: 36, borderBottom: 1, borderColor: 'divider', px: 1 }}
          >
            <Tab value="write" label="Write" sx={{ minHeight: 36, py: 0.5 }} />
            <Tab value="preview" label="Preview" sx={{ minHeight: 36, py: 0.5 }} />
          </Tabs>
        )}

        {mode === 'write' ? (
          <>
            {!hideToolbar && (
              <MarkdownEditorToolbar
                groups={groups}
                disabled={disabled}
                onAction={handleToolbarAction}
              />
            )}
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
              onChange={(event) => onChange(event.target.value)}
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
          </>
        ) : (
          <Box sx={{ px: 1.5, py: 1, minHeight: previewMinHeight(minRows), ...monospaceSx }}>
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
