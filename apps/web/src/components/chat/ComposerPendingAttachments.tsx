import { Box, Chip, IconButton, Stack } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import type { PendingImage } from './ChatComposer';
import type { PendingMention } from './mentionComposer';

interface ComposerPendingAttachmentsProps {
  mentions: PendingMention[];
  images: PendingImage[];
  onRemoveMention: (id: string) => void;
  onRemoveImage: (id: string) => void;
}

export function ComposerPendingAttachments({
  mentions,
  images,
  onRemoveMention,
  onRemoveImage,
}: ComposerPendingAttachmentsProps) {
  if (mentions.length === 0 && images.length === 0) return null;

  return (
    <Stack spacing={1}>
      {mentions.length > 0 && (
        <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: 'wrap' }}>
          {mentions.map((mention) => (
            <Chip
              key={mention.id}
              label={mention.kind === 'diff' ? '@diff' : `@${mention.path}`}
              onDelete={() => onRemoveMention(mention.id)}
              size="small"
              sx={{ fontFamily: '"IBM Plex Mono", monospace' }}
            />
          ))}
        </Stack>
      )}

      {images.length > 0 && (
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
            </Box>
          ))}
        </Stack>
      )}
    </Stack>
  );
}
