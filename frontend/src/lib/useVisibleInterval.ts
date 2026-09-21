'use client';

import { useEffect, useRef } from 'react';

/**
 * Polls `callback` every `ms`, but never while the tab is hidden and never
 * overlapping an in-flight call. Restarts (and ticks immediately) when
 * `resetKey` changes.
 */
export function useVisibleInterval(
  callback: () => void | Promise<void>,
  ms: number,
  enabled = true,
  resetKey?: unknown,
) {
  const saved = useRef(callback);
  saved.current = callback;
  const inFlight = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    const tick = async () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      if (inFlight.current) return;
      inFlight.current = true;
      try {
        await saved.current();
      } finally {
        inFlight.current = false;
      }
    };

    void tick();
    const id = setInterval(() => void tick(), ms);
    const onVis = () => {
      if (!document.hidden) void tick();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [ms, enabled, resetKey]);
}
