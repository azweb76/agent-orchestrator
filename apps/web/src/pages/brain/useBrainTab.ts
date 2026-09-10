import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { parseBrainTab, type BrainTab } from './brainTabs';

/**
 * Reads the active Brain tab from `?tab=` and writes it back without discarding
 * unrelated query params.
 */
export function useBrainTab(): { tab: BrainTab; setTab: (next: BrainTab) => void } {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = useMemo(() => parseBrainTab(searchParams.get('tab')), [searchParams]);

  const setTab = useCallback(
    (next: BrainTab) => {
      const params = new URLSearchParams(searchParams);
      if (next === 'skills') params.delete('tab');
      else params.set('tab', next);
      setSearchParams(params, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  return { tab, setTab };
}
