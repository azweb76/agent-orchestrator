import { memo } from 'react';
import { Box, Divider, IconButton, Stack, Typography } from '@mui/material';
import FormatBoldIcon from '@mui/icons-material/FormatBold';
import FormatItalicIcon from '@mui/icons-material/FormatItalic';
import StrikethroughSIcon from '@mui/icons-material/StrikethroughS';
import CodeIcon from '@mui/icons-material/Code';
import DataObjectIcon from '@mui/icons-material/DataObject';
import FormatListBulletedIcon from '@mui/icons-material/FormatListBulleted';
import FormatListNumberedIcon from '@mui/icons-material/FormatListNumbered';
import ChecklistIcon from '@mui/icons-material/Checklist';
import FormatQuoteIcon from '@mui/icons-material/FormatQuote';
import InsertLinkIcon from '@mui/icons-material/InsertLink';
import TableChartIcon from '@mui/icons-material/TableChart';
import HorizontalRuleIcon from '@mui/icons-material/HorizontalRule';
import type { ReactNode } from 'react';
import { ControlTooltip } from './ControlTooltip';
import {
  MARKDOWN_ACTION_LABELS,
  MARKDOWN_ACTION_SHORTCUTS,
  type MarkdownToolbarActionId,
} from './markdownEditorActions';

export interface MarkdownEditorToolbarProps {
  groups: MarkdownToolbarActionId[][];
  disabled?: boolean;
  onAction: (id: MarkdownToolbarActionId) => void;
}

const HEADING_GLYPHS: Partial<Record<MarkdownToolbarActionId, string>> = {
  heading1: 'H1',
  heading2: 'H2',
  heading3: 'H3',
};

const ACTION_ICONS: Partial<Record<MarkdownToolbarActionId, ReactNode>> = {
  bold: <FormatBoldIcon fontSize="small" />,
  italic: <FormatItalicIcon fontSize="small" />,
  strikethrough: <StrikethroughSIcon fontSize="small" />,
  inlineCode: <CodeIcon fontSize="small" />,
  codeBlock: <DataObjectIcon fontSize="small" />,
  bulletList: <FormatListBulletedIcon fontSize="small" />,
  numberedList: <FormatListNumberedIcon fontSize="small" />,
  taskList: <ChecklistIcon fontSize="small" />,
  blockquote: <FormatQuoteIcon fontSize="small" />,
  link: <InsertLinkIcon fontSize="small" />,
  table: <TableChartIcon fontSize="small" />,
  horizontalRule: <HorizontalRuleIcon fontSize="small" />,
};

function actionTitle(id: MarkdownToolbarActionId): string {
  const label = MARKDOWN_ACTION_LABELS[id];
  const shortcut = MARKDOWN_ACTION_SHORTCUTS[id];
  return shortcut ? `${label} (${shortcut})` : label;
}

export const MarkdownEditorToolbar = memo(function MarkdownEditorToolbar({
  groups,
  disabled,
  onAction,
}: MarkdownEditorToolbarProps) {
  return (
    <Stack
      direction="row"
      spacing={0.5}
      divider={<Divider orientation="vertical" flexItem />}
      sx={{
        flexWrap: 'wrap',
        alignItems: 'center',
        rowGap: 0.5,
        px: 1,
        py: 0.5,
        bgcolor: 'action.hover',
        borderBottom: 1,
        borderColor: 'divider',
      }}
    >
      {groups.map((group, index) => (
        <Stack key={index} direction="row" spacing={0.25} sx={{ flexWrap: 'wrap' }}>
          {group.map((id) => (
            <ControlTooltip key={id} title={actionTitle(id)} disabled={disabled}>
              <IconButton
                size="small"
                aria-label={MARKDOWN_ACTION_LABELS[id]}
                tabIndex={-1}
                disabled={disabled}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onAction(id)}
              >
                {HEADING_GLYPHS[id] ? (
                  <Box
                    component="span"
                    sx={{ fontSize: 11, fontWeight: 700, lineHeight: 1, letterSpacing: '-0.02em' }}
                  >
                    <Typography component="span" sx={{ fontSize: 11, fontWeight: 700 }}>
                      {HEADING_GLYPHS[id]}
                    </Typography>
                  </Box>
                ) : (
                  ACTION_ICONS[id]
                )}
              </IconButton>
            </ControlTooltip>
          ))}
        </Stack>
      ))}
    </Stack>
  );
});
