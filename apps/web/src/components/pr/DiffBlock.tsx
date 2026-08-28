import { Box, useTheme } from '@mui/material';

/** Unified-diff hunk renderer. Mounted lazily so a 300-file PR does not paint every patch. */
export function DiffBlock({ patch }: { patch: string }) {
  const { diff } = useTheme().palette.ao;
  const lineColors: Record<string, string> = {
    '+': diff.add,
    '-': diff.remove,
    '@': diff.hunk,
  };

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
        {patch.split('\n').map((line, index) => (
          <Box
            key={index}
            component="pre"
            sx={{
              m: 0,
              px: 1.5,
              whiteSpace: 'pre',
              overflowX: 'visible',
              maxWidth: 'none',
              bgcolor: lineColors[line[0] ?? ''] ?? 'transparent',
              color:
                line.startsWith('+')
                  ? 'success.main'
                  : line.startsWith('-')
                    ? 'error.main'
                    : line.startsWith('@')
                      ? 'secondary.main'
                      : 'text.secondary',
            }}
          >
            {line || ' '}
          </Box>
        ))}
      </Box>
    </Box>
  );
}
