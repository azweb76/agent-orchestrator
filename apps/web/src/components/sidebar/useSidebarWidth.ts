import { useCallback, useState } from 'react';
import { clampSidebarWidth, resolveSidebarWidth, SIDEBAR_DEFAULT_WIDTH } from './sidebarPrefs';

const WIDTH_STORAGE_KEY = 'ao.sidebar.width';

function loadWidth(): number {
  try {
    return resolveSidebarWidth(localStorage.getItem(WIDTH_STORAGE_KEY));
  } catch {
    return SIDEBAR_DEFAULT_WIDTH;
  }
}

function persistWidth(width: number): void {
  try {
    localStorage.setItem(WIDTH_STORAGE_KEY, String(width));
  } catch {
    // ignore
  }
}

/** Persisted expanded sidebar width for the desktop rail. */
export function useSidebarWidth(): [number, (width: number) => void] {
  const [width, setWidthState] = useState(loadWidth);

  const setWidth = useCallback((next: number) => {
    const clamped = clampSidebarWidth(next);
    setWidthState(clamped);
    persistWidth(clamped);
  }, []);

  return [width, setWidth];
}
