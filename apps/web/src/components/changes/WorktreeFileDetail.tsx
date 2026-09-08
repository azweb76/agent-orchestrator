import { useState } from 'react';
import { Box, CircularProgress, IconButton, Stack, Typography } from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { ControlTooltip } from '../ui/ControlTooltip';
import { EmptyState } from '../ui/EmptyState';
import { FileContentBlock } from './FileContentBlock';

/** Contents of the file selected in the worktree tree. */
export function WorktreeFileDetail({ agentId, path }: { agentId: string; path: string }) {
  const [copied, setCopied] = useState(false);

  const fileQuery = useQuery({
    queryKey: ['worktree-file', agentId, path],
    queryFn: () => api.getWorktreeFile(agentId, path),
    enabled: Boolean(agentId) && Boolean(path),
  });

  const copyPath = async () => {
    try {
      await navigator.clipboard.writeText(path);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <Stack spacing={1} sx={{ height: '100%', minHeight: 0 }}>
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap' }}>
        <Typography
          variant="body2"
          sx={{
            fontFamily: '"IBM Plex Mono", monospace',
            fontSize: 12.5,
            overflowWrap: 'anywhere',
            flex: 1,
            minWidth: 0,
          }}
        >
          {path}
        </Typography>
        <ControlTooltip title={copied ? 'Copied' : 'Copy path'}>
          <IconButton size="small" aria-label="Copy file path" onClick={() => void copyPath()}>
            <ContentCopyIcon fontSize="inherit" />
          </IconButton>
        </ControlTooltip>
      </Stack>
      {fileQuery.isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
          <CircularProgress size={24} />
        </Box>
      ) : fileQuery.error ? (
        <EmptyState
          compact
          title="Cannot show this file"
          description={(fileQuery.error as Error).message}
        />
      ) : fileQuery.data?.binary ? (
        <EmptyState compact title="Binary file" description="This file has no text preview." />
      ) : fileQuery.data ? (
        <>
          {fileQuery.data.truncated ? (
            <Typography variant="caption" color="text.secondary">
              Showing the first 100 KB of this file.
            </Typography>
          ) : null}
          <FileContentBlock content={fileQuery.data.content} />
        </>
      ) : null}
    </Stack>
  );
}
