import { createTheme } from '@mui/material/styles';

export const theme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: '#8ba4ff' },
    secondary: { main: '#5eead4' },
    background: {
      default: '#0b0f17',
      paper: '#121826',
    },
    divider: 'rgba(255,255,255,0.08)',
    text: {
      primary: 'rgba(255,255,255,0.92)',
      secondary: 'rgba(255,255,255,0.58)',
    },
  },
  typography: {
    fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
    h4: { fontWeight: 700, letterSpacing: '-0.02em' },
    h5: { fontWeight: 600, letterSpacing: '-0.015em' },
    h6: { fontWeight: 600 },
    button: { fontWeight: 600 },
  },
  shape: { borderRadius: 10 },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundImage:
            'radial-gradient(ellipse 70% 50% at 8% 0%, rgba(94,234,212,0.09), transparent 50%), radial-gradient(ellipse 55% 45% at 100% 0%, rgba(139,164,255,0.08), transparent 45%)',
        },
        pre: {
          fontFamily: '"IBM Plex Mono", monospace',
        },
        code: {
          fontFamily: '"IBM Plex Mono", monospace',
          fontSize: '0.9em',
        },
        '::selection': {
          backgroundColor: 'rgba(94,234,212,0.28)',
        },
      },
    },
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: {
          border: '1px solid rgba(255,255,255,0.08)',
          backgroundImage: 'none',
        },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 600,
          borderRadius: 8,
        },
        sizeSmall: {
          paddingInline: 12,
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          fontWeight: 600,
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 600,
          minHeight: 44,
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          backgroundImage: 'none',
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          backgroundColor: 'rgba(11,15,23,0.35)',
        },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          fontSize: '0.75rem',
          bgcolor: '#1a2233',
          border: '1px solid rgba(255,255,255,0.1)',
        },
      },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          '&.Mui-selected': {
            bgcolor: 'rgba(94,234,212,0.1)',
            '&:hover': {
              bgcolor: 'rgba(94,234,212,0.14)',
            },
          },
        },
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
