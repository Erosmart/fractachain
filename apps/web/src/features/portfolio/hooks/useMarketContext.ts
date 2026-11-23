import { useEffect, useState } from 'react';
import type { ListingDetail, Pool } from '@/core/api/types';
import { container } from '@/core/container';

/** Public offerings (for progress against caps). */
export function usePools() {
  const [pools, setPools] = useState<Pool[] | null>(null);
  useEffect(() => {
    let alive = true;
    container.api.listings
      .pools()
      .then((p) => alive && setPools(p))
      .catch(() => alive && setPools([]));
    return () => {
      alive = false;
    };
  }, []);
  return pools;
}

/** Network name + latest ledger, for the "Stellar testnet · ledger N" chip. */
export function useLedger() {
  const [state, setState] = useState<{ network: string; ledger: number } | null>(null);
  useEffect(() => {
    let alive = true;
    container.api.onChain
      .status()
      .then((s) => {
        const ledger = Number((s as { ledger?: unknown }).ledger);
        if (alive && Number.isFinite(ledger) && ledger > 0) setState({ network: s.network, ledger });
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  return state;
}

/** Detail of one listing (dates and length of the offering). */
export function useListing(listingId: string | undefined) {
  const [listing, setListing] = useState<ListingDetail | null>(null);
  useEffect(() => {
    if (!listingId) return;
    let alive = true;
    container.api.listings
      .get(listingId)
      .then((env) => alive && setListing(env.data))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [listingId]);
  return listing;
}

export function useIsNarrow(): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)');
    const sync = () => setNarrow(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);
  return narrow;
}
