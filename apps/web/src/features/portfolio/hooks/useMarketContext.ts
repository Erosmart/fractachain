import { useEffect, useState } from 'react';
import type { ListingDetail, Pool, SandboxOrder } from '@/core/api/types';
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

export interface OpenOrder extends SandboxOrder {
  listingId: string;
  tokenTicker: string;
}

/** The investor's resting orders across the books of the assets they hold. */
export function useOpenOrders(listingIds: string[]) {
  const [orders, setOrders] = useState<OpenOrder[] | null>(null);
  const [nonce, setNonce] = useState(0);
  const key = listingIds.join('|');

  useEffect(() => {
    let alive = true;
    if (!listingIds.length) {
      setOrders([]);
      return;
    }
    Promise.allSettled(listingIds.map((id) => container.api.market.sandboxBook(id)))
      .then((results) => {
        if (!alive) return;
        const rows: OpenOrder[] = [];
        results.forEach((r, i) => {
          if (r.status !== 'fulfilled') return;
          for (const o of r.value.myOrders || []) {
            if (o.status === 'OPEN' || o.status === 'PARTIAL') {
              rows.push({ ...o, listingId: listingIds[i], tokenTicker: r.value.tokenTicker });
            }
          }
        });
        setOrders(rows);
      })
      .catch(() => alive && setOrders([]));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, nonce]);

  return { orders, reload: () => setNonce((n) => n + 1) };
}

/** `true` below the `sm` breakpoint (fewer bars, cards instead of tables). */
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
