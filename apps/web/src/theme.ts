import { createTheme } from '@mui/material/styles';

export const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: '#7c9cff' },
    secondary: { main: '#5eead4' },
    background: {
      default: '#0b0f17',
      paper: '#121826',
    },
    divider: 'rgba(255,255,255,0.08)',
  },
  typography: {
    fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
    h4: { fontWeight: 700, letterSpacing: '-0.02em' },
    h5: { fontWeight: 600 },
    h6: { fontWeight: 600 },
  },
  shape: { borderRadius: 12 },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundImage:
            'radial-gradient(circle at top left, rgba(124,156,255,0.12), transparent 40%), radial-gradient(circle at bottom right, rgba(94,234,212,0.08), transparent 35%)',
        },
        pre: {
          fontFamily: '"IBM Plex Mono", monospace',
        },
        code: {
          fontFamily: '"IBM Plex Mono", monospace',
        },
      },
    },
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          border: '1px solid rgba(255,255,255,0.08)',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: { textTransform: 'none', fontWeight: 600 },
      },
    },
  },
});

export function statusColor(status: string): 'default' | 'success' | 'warning' | 'error' | 'info' {
  switch (status) {
    case 'running':
      return 'info';
    case 'idle':
      return 'success';
    case 'stopped':
      return 'warning';
    case 'archived':
      return 'default';
    default:
      return 'default';
  }
}
