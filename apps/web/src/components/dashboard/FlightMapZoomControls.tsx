import { Box, IconButton, Stack, Typography } from '@mui/material';
import AddOutlinedIcon from '@mui/icons-material/AddOutlined';
import RemoveOutlinedIcon from '@mui/icons-material/RemoveOutlined';
import CenterFocusStrongOutlinedIcon from '@mui/icons-material/CenterFocusStrongOutlined';
import { ControlTooltip } from '../ui/ControlTooltip';

export interface FlightMapZoomControlsProps {
  scale: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
}

export function FlightMapZoomControls({
  scale,
  onZoomIn,
  onZoomOut,
  onReset,
}: FlightMapZoomControlsProps) {
  return (
    <Stack
      direction="row"
      spacing={0.5}
      sx={{
        position: 'absolute',
        right: { xs: 10, md: 14 },
        top: 10,
        zIndex: 7,
        px: 0.5,
        py: 0.35,
        borderRadius: 1,
        bgcolor: 'rgba(6, 14, 24, 0.7)',
        backdropFilter: 'blur(4px)',
        border: '1px solid',
        borderColor: 'divider',
        alignItems: 'center',
      }}
    >
      <ControlTooltip title="Zoom out">
        <span>
          <IconButton
            size="small"
            aria-label="Zoom out map"
            onClick={onZoomOut}
            disabled={scale <= 1}
            sx={{ color: '#dbe7ff' }}
          >
            <RemoveOutlinedIcon fontSize="small" />
          </IconButton>
        </span>
      </ControlTooltip>
      <Typography
        variant="caption"
        sx={{
          minWidth: 36,
          textAlign: 'center',
          fontFamily: 'IBM Plex Mono, monospace',
          fontSize: '0.65rem',
          color: '#dbe7ff',
        }}
      >
        {Math.round(scale * 100)}%
      </Typography>
      <ControlTooltip title="Zoom in">
        <span>
          <IconButton
            size="small"
            aria-label="Zoom in map"
            onClick={onZoomIn}
            disabled={scale >= 2.5}
            sx={{ color: '#dbe7ff' }}
          >
            <AddOutlinedIcon fontSize="small" />
          </IconButton>
        </span>
      </ControlTooltip>
      <Box sx={{ width: 1, alignSelf: 'stretch', bgcolor: 'divider', mx: 0.25 }} />
      <ControlTooltip title="Reset view">
        <IconButton size="small" aria-label="Reset map zoom" onClick={onReset} sx={{ color: '#dbe7ff' }}>
          <CenterFocusStrongOutlinedIcon fontSize="small" />
        </IconButton>
      </ControlTooltip>
    </Stack>
  );
}
