import { Box, useTheme } from '@mui/material';

/** Plain-text file renderer sharing the diff viewer's monospace surface. */
export function FileContentBlock({ content }: { content: string }) {
  const { diff } = useTheme().palette.ao;

  return (
    <Box
      sx={{
        fontFamily: '"IBM Plex Mono", monospace',
        fontSize: 12.5,
        lineHeight: 1.55,
        bgcolor: diff.backdrop,
        borderRadius: 2,
        overflowX: 'auto',
        py: 0.5,
      }}
    >
      {/* Override theme `pre` overflow/maxWidth so only this block scrolls. */}
      <Box sx={{ width: 'max-content', minWidth: '100%' }}>
        {content.split('\n').map((line, index) => (
          <Box
            key={index}
            component="pre"
            sx={{
              m: 0,
              px: 1.5,
              whiteSpace: 'pre',
              overflowX: 'visible',
              maxWidth: 'none',
              color: 'text.secondary',
            }}
          >
            {line || ' '}
          </Box>
        ))}
      </Box>
    </Box>
  );
}
