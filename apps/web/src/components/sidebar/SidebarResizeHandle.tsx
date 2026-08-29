import { useEffect, useRef } from 'react';
import { Box } from '@mui/material';
import {
  clampSidebarWidth,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
} from './sidebarPrefs';

interface SidebarResizeHandleProps {
  currentWidth: number;
  onWidthChange: (width: number) => void;
  onResizingChange?: (resizing: boolean) => void;
}

/**
 * Drag handle on the right edge of the desktop sidebar. Pointer position maps
 * directly to sidebar width (sidebar is flush-left under the header).
 */
export function SidebarResizeHandle({
  currentWidth,
  onWidthChange,
  onResizingChange,
}: SidebarResizeHandleProps) {
  const dragging = useRef(false);
  const widthRef = useRef(currentWidth);
  widthRef.current = currentWidth;

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      if (!dragging.current) return;
      onWidthChange(clampSidebarWidth(event.clientX));
    };
    const endDrag = () => {
      if (!dragging.current) return;
      dragging.current = false;
      onResizingChange?.(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', endDrag);
      window.removeEventListener('pointercancel', endDrag);
    };
  }, [onWidthChange, onResizingChange]);

  return (
    <Box
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize sidebar"
      aria-valuemin={SIDEBAR_MIN_WIDTH}
      aria-valuemax={SIDEBAR_MAX_WIDTH}
      aria-valuenow={currentWidth}
      tabIndex={0}
      onPointerDown={(event) => {
        event.preventDefault();
        dragging.current = true;
        onResizingChange?.(true);
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        onWidthChange(clampSidebarWidth(event.clientX));
      }}
      onKeyDown={(event) => {
        const step = event.shiftKey ? 24 : 12;
        if (event.key === 'ArrowLeft') {
          event.preventDefault();
          onWidthChange(clampSidebarWidth(widthRef.current - step));
        } else if (event.key === 'ArrowRight') {
          event.preventDefault();
          onWidthChange(clampSidebarWidth(widthRef.current + step));
        } else if (event.key === 'Home') {
          event.preventDefault();
          onWidthChange(SIDEBAR_MIN_WIDTH);
        } else if (event.key === 'End') {
          event.preventDefault();
          onWidthChange(SIDEBAR_MAX_WIDTH);
        }
      }}
      sx={{
        position: 'absolute',
        top: 0,
        right: -3,
        width: 6,
        height: '100%',
        cursor: 'col-resize',
        zIndex: 2,
        touchAction: 'none',
        bgcolor: 'transparent',
        transition: (theme) =>
          theme.transitions.create('background-color', {
            duration: theme.transitions.duration.shortest,
          }),
        '&:hover, &:focus-visible': {
          bgcolor: 'secondary.main',
          opacity: 0.45,
        },
      }}
    />
  );
}
