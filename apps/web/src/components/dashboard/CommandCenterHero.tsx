import { useEffect, useState } from 'react';
import { Box, Stack, Typography } from '@mui/material';

function greetingForHour(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

type CommandCenterHeroProps = {
  githubLogin?: string | null;
  systemsMessage: string;
};

export function CommandCenterHero({ githubLogin, systemsMessage }: CommandCenterHeroProps) {
  const [now, setNow] = useState(() => new Date());
  const [greetingHour, setGreetingHour] = useState(() => new Date().getHours());

  useEffect(() => {
    const id = window.setInterval(() => {
      const next = new Date();
      setNow(next);
      const hour = next.getHours();
      setGreetingHour((prev) => (hour === prev ? prev : hour));
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  const clock = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const dateLabel = now.toLocaleDateString([], {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });

  return (
    <Stack
      direction={{ xs: 'column', md: 'row' }}
      spacing={2}
      sx={{ justifyContent: 'space-between', alignItems: { md: 'flex-end' } }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Typography
          variant="caption"
          sx={{
            fontFamily: '"IBM Plex Mono", monospace',
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            color: 'secondary.main',
            display: 'block',
            mb: 1,
          }}
        >
          Command center
        </Typography>
        <Typography
          variant="h3"
          sx={{
            fontWeight: 700,
            letterSpacing: '-0.03em',
            fontSize: { xs: '1.75rem', md: '2.2rem' },
            mb: 0.75,
          }}
        >
          {greetingForHour(greetingHour)}
          {githubLogin ? `, ${githubLogin}` : ''}
        </Typography>
        <Typography color="text.secondary" sx={{ maxWidth: 520, lineHeight: 1.5, overflowWrap: 'anywhere' }}>
          {systemsMessage}
        </Typography>
      </Box>

      <Stack spacing={0.5} sx={{ alignItems: { xs: 'flex-start', md: 'flex-end' }, flexShrink: 0 }}>
        <Typography
          sx={{
            fontFamily: '"IBM Plex Mono", monospace',
            fontSize: { xs: '1.35rem', md: '1.65rem' },
            fontWeight: 500,
            color: 'secondary.main',
            letterSpacing: '0.04em',
            animation: 'ao-clock-glow 3s ease-in-out infinite',
            '@keyframes ao-clock-glow': {
              '0%, 100%': { opacity: 1 },
              '50%': { opacity: 0.72 },
            },
          }}
        >
          {clock}
        </Typography>
        <Typography
          variant="caption"
          sx={{ fontFamily: '"IBM Plex Mono", monospace', color: 'text.secondary' }}
        >
          {dateLabel}
        </Typography>
      </Stack>
    </Stack>
  );
}
