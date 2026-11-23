import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage } from '@/core/errors';

export interface ChainResource<T> {
  data: T | null;
  /** First load only; refreshes keep the previous data on screen. */
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  /** When the last successful read finished (client clock). */
  updatedAt: Date | null;
  reload: () => void;
}

/** Contract reads change slowly; the API also caches them for a few seconds. */
const REFRESH_MS = 30_000;

/**
 * Loads a read-only chain view and re-reads it while the tab is visible.
 * A failed refresh keeps the last good values and surfaces the error.
 */
export function useChainResource<T>(load: () => Promise<T>, key: unknown = null): ChainResource<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const loader = useRef(load);
  loader.current = load;
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const run = useCallback(async () => {
    setRefreshing(true);
    try {
      const next = await loader.current();
      if (!alive.current) return;
      setData(next);
      setError(null);
      setUpdatedAt(new Date());
    } catch (err) {
      if (alive.current) setError(errorMessage(err));
    } finally {
      if (alive.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    void run();
  }, [run, key]);

  // Re-read while the tab is visible (no immediate tick: the load above just ran).
  useEffect(() => {
    const id = setInterval(() => {
      if (typeof document === 'undefined' || !document.hidden) void run();
    }, REFRESH_MS);
    return () => clearInterval(id);
  }, [run, key]);

  return { data, loading, refreshing, error, updatedAt, reload: () => void run() };
}
