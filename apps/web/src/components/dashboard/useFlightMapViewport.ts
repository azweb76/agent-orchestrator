import { useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react';

const MIN_SCALE = 1;
const MAX_SCALE = 2.5;
const STEP = 0.25;

export interface FlightMapViewport {
  scale: number;
  offsetX: number;
  offsetY: number;
  panning: boolean;
  zoomIn: () => void;
  zoomOut: () => void;
  reset: () => void;
  onWheel: (event: ReactWheelEvent) => void;
  onPointerDown: (event: ReactPointerEvent) => void;
  onPointerMove: (event: ReactPointerEvent) => void;
  onPointerUp: (event: ReactPointerEvent) => void;
}

function clampScale(value: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));
}

/** Pan/zoom state for the top-down flight map (wheel + drag + buttons). */
export function useFlightMapViewport(): FlightMapViewport {
  const [scale, setScale] = useState(1);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [panning, setPanning] = useState(false);
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  const zoomIn = () => setScale((s) => clampScale(s + STEP));
  const zoomOut = () => {
    setScale((s) => {
      const next = clampScale(s - STEP);
      if (next <= 1) {
        setOffsetX(0);
        setOffsetY(0);
      }
      return next;
    });
  };
  const reset = () => {
    setScale(1);
    setOffsetX(0);
    setOffsetY(0);
  };

  const onWheel = (event: ReactWheelEvent) => {
    event.preventDefault();
    const delta = event.deltaY > 0 ? -STEP / 2 : STEP / 2;
    setScale((s) => {
      const next = clampScale(s + delta);
      if (next <= 1) {
        setOffsetX(0);
        setOffsetY(0);
      }
      return next;
    });
  };

  const onPointerDown = (event: ReactPointerEvent) => {
    if (scale <= 1) return;
    // Don't steal clicks from plane buttons / zoom controls.
    const target = event.target as HTMLElement | null;
    if (target?.closest('button')) return;
    dragRef.current = { x: event.clientX, y: event.clientY, ox: offsetX, oy: offsetY };
    setPanning(true);
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: ReactPointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    setOffsetX(drag.ox + (event.clientX - drag.x));
    setOffsetY(drag.oy + (event.clientY - drag.y));
  };

  const onPointerUp = (event: ReactPointerEvent) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    setPanning(false);
    try {
      (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
    } catch {
      // already released
    }
  };

  return {
    scale,
    offsetX,
    offsetY,
    panning,
    zoomIn,
    zoomOut,
    reset,
    onWheel,
    onPointerDown,
    onPointerMove,
    onPointerUp,
  };
}
