import { alpha, createTheme, type PaletteMode } from '@mui/material/styles';
import { buildAoPalette } from './themeTokens';

const sharedTypography = {
  fontFamily: '"IBM Plex Sans", system-ui, sans-serif',
  h4: { fontWeight: 700, letterSpacing: '-0.02em' },
  h5: { fontWeight: 600, letterSpacing: '-0.015em' },
  h6: { fontWeight: 600 },
  button: { fontWeight: 600 },
} as const;

const darkPalette = {
  mode: 'dark' as const,
  primary: { main: '#8ba4ff', light: '#a8b8ff', dark: '#6b84e8', contrastText: '#0b0f17' },
  secondary: { main: '#5eead4', light: '#7ef0de', dark: '#3dd4bc', contrastText: '#0b0f17' },
  success: { main: '#4ade80', light: '#86efac', contrastText: '#0b0f17' },
  error: { main: '#f87171', light: '#fca5a5', contrastText: '#0b0f17' },
  warning: { main: '#ffb74d', light: '#ffcc80', contrastText: '#0b0f17' },
  info: { main: '#7c9cff', light: '#9cb4ff', contrastText: '#0b0f17' },
  background: {
    default: '#0b0f17',
    paper: '#141c2e',
  },
  divider: 'rgba(255,255,255,0.1)',
  text: {
    primary: 'rgba(255,255,255,0.94)',
    secondary: 'rgba(255,255,255,0.62)',
    disabled: 'rgba(255,255,255,0.38)',
  },
  action: {
    hover: 'rgba(255,255,255,0.06)',
    selected: 'rgba(94,234,212,0.12)',
    disabled: 'rgba(255,255,255,0.42)',
    disabledBackground: 'rgba(255,255,255,0.12)',
  },
};

const lightPalette = {
  mode: 'light' as const,
  primary: { main: '#3f5fd6', light: '#6280e8', dark: '#2f4bb0', contrastText: '#ffffff' },
  secondary: { main: '#0d9488', light: '#14b8a6', dark: '#0f766e', contrastText: '#ffffff' },
  success: { main: '#16a34a', light: '#22c55e', contrastText: '#ffffff' },
  error: { main: '#dc2626', light: '#ef4444', contrastText: '#ffffff' },
  warning: { main: '#d97706', light: '#f59e0b', contrastText: '#ffffff' },
  info: { main: '#4f6fd6', light: '#6b8ae8', contrastText: '#ffffff' },
  background: {
    default: '#f6f8fc',
    paper: '#ffffff',
  },
  divider: 'rgba(15,23,42,0.12)',
  text: {
    primary: 'rgba(15,23,42,0.92)',
    secondary: 'rgba(15,23,42,0.64)',
    disabled: 'rgba(15,23,42,0.42)',
  },
  action: {
    hover: 'rgba(15,23,42,0.04)',
    selected: 'rgba(13,148,136,0.1)',
    disabled: 'rgba(15,23,42,0.55)',
    disabledBackground: 'rgba(15,23,42,0.14)',
  },
};

function scrollbarStyles(isDark: boolean) {
  const thumb = isDark ? 'rgba(255,255,255,0.18)' : 'rgba(15,23,42,0.22)';
  const thumbHover = isDark ? 'rgba(255,255,255,0.28)' : 'rgba(15,23,42,0.32)';
  const track = isDark ? 'rgba(255,255,255,0.04)' : 'rgba(15,23,42,0.04)';
  return {
    scrollbarWidth: 'thin' as const,
    scrollbarColor: `${thumb} ${track}`,
    '&::-webkit-scrollbar': { width: 8, height: 8 },
    '&::-webkit-scrollbar-track': { backgroundColor: track, borderRadius: 4 },
    '&::-webkit-scrollbar-thumb': {
      backgroundColor: thumb,
      borderRadius: 4,
      border: `2px solid ${track}`,
    },
    '&::-webkit-scrollbar-thumb:hover': { backgroundColor: thumbHover },
  };
}

export function createAppTheme(mode: PaletteMode) {
  const isDark = mode === 'dark';
  const ao = buildAoPalette(mode);

  return createTheme({
    palette: { ...(isDark ? darkPalette : lightPalette), ao },
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
            backgroundImage: ao.gradient.body,
            ...scrollbarStyles(isDark),
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
            backgroundColor: isDark ? alpha('#5eead4', 0.28) : alpha('#0d9488', 0.22),
          },
        },
      },
      MuiPaper: {
        defaultProps: { elevation: 0 },
        styleOverrides: {
          root: {
            border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : 'rgba(15,23,42,0.1)'}`,
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
          contained: ({ theme }) => ({
            // Keep disabled fills readable in light mode (white contrastText on a pale
            // disabledBackground is otherwise nearly invisible).
            '&.Mui-disabled': {
              color: theme.palette.action.disabled,
              backgroundColor: theme.palette.action.disabledBackground,
            },
          }),
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
          outlined: ({ theme }) => ({
            borderColor: alpha(theme.palette.text.primary, isDark ? 0.22 : 0.18),
          }),
        },
      },
      MuiTab: {
        styleOverrides: {
          root: {
            textTransform: 'none',
            fontWeight: 600,
            minHeight: 44,
            minWidth: 0,
            '&.Mui-selected': {
              color: isDark ? '#5eead4' : '#0d9488',
            },
          },
        },
      },
      MuiTabs: {
        styleOverrides: {
          root: {
            minWidth: 0,
          },
          indicator: {
            backgroundColor: isDark ? '#5eead4' : '#0d9488',
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
            backgroundColor: ao.surface.inset,
            '&:hover .MuiOutlinedInput-notchedOutline': {
              borderColor: isDark ? 'rgba(255,255,255,0.22)' : 'rgba(15,23,42,0.28)',
            },
            '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
              borderColor: isDark ? '#5eead4' : '#0d9488',
            },
          },
        },
      },
      MuiTooltip: {
        styleOverrides: {
          tooltip: {
            fontSize: '0.75rem',
            // Light mode needs a dark chip so labels stay readable on pale surfaces
            // (white-on-white tooltips disappear against paper/header fills).
            bgcolor: isDark ? '#1e2838' : '#1e293b',
            color: isDark ? 'rgba(255,255,255,0.94)' : 'rgba(248,250,252,0.96)',
            border: `1px solid ${isDark ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.2)'}`,
            boxShadow: isDark ? 'none' : '0 6px 20px rgba(15,23,42,0.18)',
          },
          arrow: {
            color: isDark ? '#1e2838' : '#1e293b',
          },
        },
      },
      MuiListItemButton: {
        styleOverrides: {
          root: {
            borderRadius: 8,
            '&.Mui-selected': {
              bgcolor: ao.surface.selected,
              '&:hover': {
                bgcolor: ao.surface.selectedStrong,
              },
            },
            '&:hover': {
              bgcolor: ao.surface.hover,
            },
          },
        },
      },
      MuiIconButton: {
        styleOverrides: {
          root: {
            '&:hover': {
              bgcolor: ao.surface.hover,
            },
          },
        },
      },
      MuiDivider: {
        styleOverrides: {
          root: {
            borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(15,23,42,0.1)',
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
