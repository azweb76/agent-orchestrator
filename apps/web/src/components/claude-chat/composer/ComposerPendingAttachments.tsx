import { Box, Chip, IconButton, Stack } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { ControlTooltip } from '../../ui/ControlTooltip';
import type { ComposerAttachment } from '../types';

export function ComposerPendingAttachments({
  images,
  chips,
  onRemoveImage,
  onRemoveChip,
}: {
  images: ComposerAttachment[];
  chips?: { id: string; label: string }[];
  onRemoveImage: (id: string) => void;
  onRemoveChip?: (id: string) => void;
}) {
  if (images.length === 0 && !chips?.length) return null;
  return (
    <Stack spacing={1}>
      {chips && chips.length > 0 ? (
        <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: 'wrap' }}>
          {chips.map((chip) => (
            <Chip
              key={chip.id}
              label={chip.label}
              onDelete={onRemoveChip ? () => onRemoveChip(chip.id) : undefined}
              size="small"
              sx={{ fontFamily: '"IBM Plex Mono", monospace' }}
            />
          ))}
        </Stack>
      ) : null}
      {images.length > 0 ? (
        <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
          {images.map((image) => (
            <Box key={image.id} sx={{ position: 'relative' }}>
              <Box
                component="img"
                src={image.previewUrl}
                alt={image.name}
                sx={{
                  width: 72,
                  height: 72,
                  objectFit: 'cover',
                  borderRadius: 1.5,
                  border: '1px solid',
                  borderColor: 'divider',
                }}
              />
              <ControlTooltip title={`Remove ${image.name}`}>
                <IconButton
                  size="small"
                  onClick={() => onRemoveImage(image.id)}
                  aria-label={`Remove ${image.name}`}
                  sx={{
                    position: 'absolute',
                    top: -8,
                    right: -8,
                    bgcolor: 'background.paper',
                    border: '1px solid',
                    borderColor: 'divider',
                  }}
                >
                  <CloseIcon fontSize="inherit" />
                </IconButton>
              </ControlTooltip>
            </Box>
          ))}
        </Stack>
      ) : null}
    </Stack>
  );
}
