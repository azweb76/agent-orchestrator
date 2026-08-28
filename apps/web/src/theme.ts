import { createTheme, type PaletteMode } from '@mui/material/styles';

const sharedTypography = {
  fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
  h4: { fontWeight: 700, letterSpacing: '-0.02em' },
  h5: { fontWeight: 600, letterSpacing: '-0.015em' },
  h6: { fontWeight: 600 },
  button: { fontWeight: 600 },
} as const;

const darkPalette = {
  mode: 'dark' as const,
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
};

const lightPalette = {
  mode: 'light' as const,
  primary: { main: '#3f5fd6' },
  secondary: { main: '#0d9488' },
  background: {
    default: '#f4f6fb',
    paper: '#ffffff',
  },
  divider: 'rgba(15,23,42,0.1)',
  text: {
    primary: 'rgba(15,23,42,0.92)',
    secondary: 'rgba(15,23,42,0.62)',
  },
};

export function createAppTheme(mode: PaletteMode) {
  const isDark = mode === 'dark';

  return createTheme({
    palette: isDark ? darkPalette : lightPalette,
    typography: sharedTypography,
    shape: { borderRadius: 10 },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          html: {
            WebkitTextSizeAdjust: '100%',
            textSizeAdjust: '100%',
          },
          body: {
            overflowX: 'hidden',
            backgroundImage: isDark
              ? 'radial-gradient(ellipse 70% 50% at 8% 0%, rgba(94,234,212,0.09), transparent 50%), radial-gradient(ellipse 55% 45% at 100% 0%, rgba(139,164,255,0.08), transparent 45%)'
              : 'radial-gradient(ellipse 70% 50% at 8% 0%, rgba(13,148,136,0.08), transparent 50%), radial-gradient(ellipse 55% 45% at 100% 0%, rgba(63,95,214,0.07), transparent 45%)',
          },
          '#root': {
            minHeight: '100dvh',
            minWidth: 0,
          },
          img: {
            maxWidth: '100%',
            height: 'auto',
          },
          pre: {
            fontFamily: '"IBM Plex Mono", monospace',
            overflowX: 'auto',
            maxWidth: '100%',
          },
          code: {
            fontFamily: '"IBM Plex Mono", monospace',
            fontSize: '0.9em',
            overflowWrap: 'anywhere',
          },
          '::selection': {
            backgroundColor: isDark ? 'rgba(94,234,212,0.28)' : 'rgba(13,148,136,0.22)',
          },
        },
      },
      MuiPaper: {
        defaultProps: { elevation: 0 },
        styleOverrides: {
          root: {
            border: isDark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(15,23,42,0.08)',
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
            maxWidth: '100%',
          },
          label: {
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          },
        },
      },
      MuiTab: {
        styleOverrides: {
          root: {
            textTransform: 'none',
            fontWeight: 600,
            minHeight: 44,
            minWidth: 0,
          },
        },
      },
      MuiTabs: {
        styleOverrides: {
          root: {
            minWidth: 0,
          },
        },
      },
      MuiDialog: {
        styleOverrides: {
          paper: ({ theme }) => ({
            backgroundImage: 'none',
            [theme.breakpoints.down('sm')]: {
              margin: 16,
              width: 'calc(100% - 32px)',
              maxHeight: 'calc(100% - 32px)',
            },
          }),
          paperFullScreen: {
            margin: 0,
            width: '100%',
            maxHeight: '100%',
            borderRadius: 0,
          },
        },
      },
      MuiDialogActions: {
        styleOverrides: {
          root: ({ theme }) => ({
            [theme.breakpoints.down('sm')]: {
              position: 'sticky',
              bottom: 0,
              paddingBottom: 'calc(8px + env(safe-area-inset-bottom, 0px))',
              backgroundColor: theme.palette.background.paper,
              borderTop: `1px solid ${theme.palette.divider}`,
            },
          }),
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            backgroundColor: isDark ? 'rgba(11,15,23,0.35)' : 'rgba(255,255,255,0.72)',
          },
        },
      },
      MuiTooltip: {
        styleOverrides: {
          tooltip: {
            fontSize: '0.75rem',
            bgcolor: isDark ? '#1a2233' : '#ffffff',
            color: isDark ? 'rgba(255,255,255,0.92)' : 'rgba(15,23,42,0.92)',
            border: isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(15,23,42,0.1)',
          },
        },
      },
      MuiListItemButton: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            '&.Mui-selected': {
              bgcolor: isDark ? 'rgba(94,234,212,0.1)' : 'rgba(13,148,136,0.1)',
              '&:hover': {
                bgcolor: isDark ? 'rgba(94,234,212,0.14)' : 'rgba(13,148,136,0.14)',
              },
            },
          },
        },
      },
    },
  });
}

/** @deprecated Use createAppTheme — kept for tests that import statusColor only. */
export const theme = createAppTheme('dark');

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
