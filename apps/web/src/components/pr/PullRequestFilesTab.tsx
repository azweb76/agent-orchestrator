import { useState } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Chip,
  Link,
  Stack,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';
import type { PullRequestFile, PullRequestFiles } from '@agent-orchestrator/shared';
import { EmptyState } from '../ui/EmptyState';
import { DiffBlock } from './DiffBlock';
import { TabState } from './TabState';

const STATUS_COLORS: Record<string, 'success' | 'error' | 'warning' | 'info' | 'default'> = {
  added: 'success',
  removed: 'error',
  modified: 'warning',
  renamed: 'info',
  copied: 'info',
  changed: 'warning',
  unchanged: 'default',
};

function fileLabel(file: PullRequestFile): string {
  return file.previousFilename ? `${file.previousFilename} → ${file.filename}` : file.filename;
}

export interface PullRequestFilesTabProps {
  files?: PullRequestFiles;
  loading: boolean;
  error: unknown;
}

export function PullRequestFilesTab({ files, loading, error }: PullRequestFilesTabProps) {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <TabState
      loading={loading}
      error={error}
      isEmpty={!files || files.files.length === 0}
      empty={<EmptyState compact title="No file changes" description="This pull request changes no files." />}
    >
      <Stack spacing={1.5}>
        {files?.truncated ? (
          <Alert severity="info">
            GitHub caps this list at 300 files. Open the pull request on GitHub to see the rest.
          </Alert>
        ) : null}
        <Box>
          {files?.files.map((file) => (
            <Accordion
              key={file.filename}
              disableGutters
              expanded={expanded === file.filename}
              onChange={(_, isExpanded) => setExpanded(isExpanded ? file.filename : null)}
              sx={{ bgcolor: 'transparent', '&:before': { display: 'none' } }}
            >
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Stack
                  direction="row"
                  spacing={1}
                  useFlexGap
                  sx={{ alignItems: 'center', flexWrap: 'wrap', minWidth: 0, pr: 1 }}
                >
                  <Typography
                    variant="body2"
                    sx={{ fontFamily: '"IBM Plex Mono", monospace', overflowWrap: 'anywhere' }}
                  >
                    {fileLabel(file)}
                  </Typography>
                  <Chip
                    size="small"
                    variant="outlined"
                    color={STATUS_COLORS[file.status] ?? 'default'}
                    label={file.status}
                  />
                  <Typography variant="caption" color="success.light">
                    +{file.additions}
                  </Typography>
                  <Typography variant="caption" color="error.light">
                    −{file.deletions}
                  </Typography>
                </Stack>
              </AccordionSummary>
              <AccordionDetails sx={{ pt: 0 }}>
                {/* Diffs mount on expand so a large PR does not render every patch up front. */}
                {file.patch ? (
                  <DiffBlock patch={file.patch} />
                ) : (
                  <Typography variant="body2" color="text.secondary">
                    No text diff available (binary file or a diff too large for the API).
                  </Typography>
                )}
                {file.blobUrl ? (
                  <Link
                    href={file.blobUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    underline="hover"
                    variant="body2"
                    sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, mt: 1 }}
                  >
                    View file <OpenInNewIcon sx={{ fontSize: 14 }} />
                  </Link>
                ) : null}
              </AccordionDetails>
            </Accordion>
          ))}
        </Box>
      </Stack>
    </TabState>
  );
}
