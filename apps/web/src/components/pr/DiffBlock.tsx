import { Box } from '@mui/material';

const LINE_COLORS: Record<string, string> = {
  '+': 'rgba(74,222,128,0.10)',
  '-': 'rgba(248,113,113,0.10)',
  '@': 'rgba(94,234,212,0.08)',
};

/** Unified-diff hunk renderer. Mounted lazily so a 300-file PR does not paint every patch. */
export function DiffBlock({ patch }: { patch: string }) {
  return (
    <Box
      sx={{
        fontFamily: '"IBM Plex Mono", monospace',
        fontSize: 12.5,
        lineHeight: 1.55,
        bgcolor: 'rgba(0,0,0,0.35)',
        borderRadius: 2,
        overflowX: 'auto',
        py: 0.5,
      }}
    >
      {patch.split('\n').map((line, index) => (
        <Box
          key={index}
          component="pre"
          sx={{
            m: 0,
            px: 1.5,
            whiteSpace: 'pre',
            bgcolor: LINE_COLORS[line[0] ?? ''] ?? 'transparent',
            color:
              line.startsWith('+')
                ? 'success.light'
                : line.startsWith('-')
                  ? 'error.light'
                  : line.startsWith('@')
                    ? 'secondary.light'
                    : 'text.secondary',
          }}
        >
          {line || ' '}
        </Box>
      ))}
    </Box>
  );
}
