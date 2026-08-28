import { useSseConnectionState } from './events';

/** Slow poll while the fleet SSE stream is down (idle workloads). */
export const SSE_FALLBACK_POLL_MS = 60_000;
/** Faster poll while SSE is down but agents are still running. */
export const SSE_FALLBACK_ACTIVE_POLL_MS = 15_000;

/**
 * TanStack `refetchInterval` helper: no polling while SSE is connected; slow
 * fallback intervals only while the stream is down.
 */
export function useSsePollingFallback(active = false): number | false {
  const connected = useSseConnectionState() === 'connected';
  if (connected) return false;
  return active ? SSE_FALLBACK_ACTIVE_POLL_MS : SSE_FALLBACK_POLL_MS;
}
