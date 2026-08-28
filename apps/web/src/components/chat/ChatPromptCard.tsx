import type { ReactNode } from 'react';
import { Box, Stack, Typography, useTheme } from '@mui/material';

type AccentKey = 'info' | 'warning' | 'success';

interface ChatPromptCardProps {
  accent: AccentKey;
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
}

/** Shared chrome for in-chat permission / question / plan prompts. */
export function ChatPromptCard({
  accent,
  icon,
  title,
  description,
  children,
  actions,
}: ChatPromptCardProps) {
  const theme = useTheme();
  const ao = theme.palette.ao;
  const colors =
    accent === 'info'
      ? { border: ao.accent.primaryBorder, bg: ao.accent.primaryTint }
      : accent === 'warning'
        ? { border: ao.accent.warningBorder, bg: ao.accent.warningTint }
        : { border: ao.accent.secondaryBorder, bg: ao.accent.secondaryTint };

  return (
    <Box
      sx={{
        mb: 2,
        p: { xs: 1.5, sm: 2 },
        border: '1px solid',
        borderColor: colors.border,
        bgcolor: colors.bg,
        borderRadius: 2.5,
      }}
    >
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: description ? 0.5 : 1.25 }}>
        {icon ? (
          <Box sx={{ display: 'flex', color: 'text.secondary', '& > svg': { fontSize: 20 } }}>{icon}</Box>
        ) : null}
        <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.3 }}>
          {title}
        </Typography>
      </Stack>
      {description ? (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5, lineHeight: 1.5 }}>
          {description}
        </Typography>
      ) : null}
      {children}
      {actions ? (
        <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', mt: 2 }}>
          {actions}
        </Stack>
      ) : null}
    </Box>
  );
}
