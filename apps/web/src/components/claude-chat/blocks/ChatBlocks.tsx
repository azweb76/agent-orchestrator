import { useState } from 'react';
import { Box, Collapse, Typography } from '@mui/material';
import type { ChatBlock } from '../types';
import { MarkdownContent } from '../MarkdownContent';

export function ThinkingBlock({ block }: { block: Extract<ChatBlock, { type: 'thinking' }> }) {
  const [open, setOpen] = useState(false);
  if (block.redacted) {
    return (
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1, fontStyle: 'italic' }}>
        Thinking redacted
      </Typography>
    );
  }
  return (
    <Box sx={{ mb: 1 }}>
      <Typography
        component="button"
        variant="caption"
        onClick={() => setOpen((value) => !value)}
        sx={{
          display: 'block',
          border: 0,
          background: 'none',
          color: 'text.secondary',
          cursor: 'pointer',
          px: 0,
          fontWeight: 600,
        }}
      >
        {open ? 'Hide thinking' : 'Show thinking'}
      </Typography>
      <Collapse in={open}>
        <Box sx={{ mt: 0.5, color: 'text.secondary', fontStyle: 'italic' }}>
          <MarkdownContent content={block.text} />
        </Box>
      </Collapse>
    </Box>
  );
}

export function TodoListBlock({ block }: { block: Extract<ChatBlock, { type: 'todo_list' }> }) {
  return (
    <Box sx={{ mb: 1.25, p: 1.25, borderRadius: 1.5, border: 1, borderColor: 'divider', bgcolor: 'ao.surface.overlay' }}>
      <Typography variant="caption" sx={{ fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
        Tasks
      </Typography>
      <Box component="ul" sx={{ m: 0, mt: 0.75, pl: 2.25 }}>
        {block.items.map((item, index) => (
          <Typography key={`${item.content}-${index}`} component="li" variant="body2" sx={{ mb: 0.4 }}>
            {item.status === 'completed' ? '☑' : item.status === 'in_progress' ? '►' : '☐'} {item.content}
          </Typography>
        ))}
      </Box>
    </Box>
  );
}

export function DiffBlock({ block }: { block: Extract<ChatBlock, { type: 'diff' }> }) {
  return (
    <Box sx={{ mb: 1.25 }}>
      {block.path ? (
        <Typography variant="caption" color="text.secondary" sx={{ fontFamily: '"IBM Plex Mono", monospace' }}>
          {block.path}
        </Typography>
      ) : null}
      <Box
        component="pre"
        sx={{
          m: 0,
          mt: 0.5,
          p: 1.25,
          overflow: 'auto',
          borderRadius: 1.5,
          bgcolor: 'ao.surface.code',
          border: 1,
          borderColor: 'divider',
          fontFamily: '"IBM Plex Mono", monospace',
          fontSize: 12,
          whiteSpace: 'pre',
        }}
      >
        {block.diff}
      </Box>
    </Box>
  );
}

export function ImageBlock({ block }: { block: Extract<ChatBlock, { type: 'image' }> }) {
  const src =
    block.url ??
    (block.data && block.mimeType ? `data:${block.mimeType};base64,${block.data}` : undefined);
  if (!src) return null;
  return (
    <Box
      component="img"
      src={src}
      alt={block.alt ?? ''}
      sx={{ maxWidth: '100%', height: 'auto', borderRadius: 1.5, my: 1, display: 'block' }}
    />
  );
}
