import { Box, Typography } from '@mui/material';

function greetingForHour(hour: number): string {
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

type CommandCenterHeroProps = {
  githubLogin?: string | null;
};

export function CommandCenterHero({ githubLogin }: CommandCenterHeroProps) {
  const greeting = greetingForHour(new Date().getHours());

  return (
    <Box sx={{ minWidth: 0, mb: 2 }}>
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
          fontSize: { xs: '1.5rem', md: '1.85rem' },
        }}
      >
        {greeting}
        {githubLogin ? `, ${githubLogin}` : ''}
      </Typography>
    </Box>
  );
}
