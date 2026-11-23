import { useEffect, useState } from 'react';
import type { Pool } from '@/core/api/types';
import { container } from '@/core/container';
import { isVisibleListing } from '@/core/market/listings';

/**
 * Public offerings for the landing. Several islands read them (hero panel,
 * offering cards): one request per page load, shared through a module
 * promise.
 */
let pending: Promise<Pool[]> | null = null;

function loadPools(): Promise<Pool[]> {
  pending ??= container.api.listings
    .pools()
    .then((pools) => pools.filter((p) => isVisibleListing(p.id)))
    .catch((err: unknown) => {
      pending = null; // let a later island retry
      throw err;
    });
  return pending;
}

export type PoolsState = { kind: 'loading' } | { kind: 'ready'; pools: Pool[] } | { kind: 'error' };

export function useLivePools(): PoolsState {
  const [state, setState] = useState<PoolsState>({ kind: 'loading' });
  useEffect(() => {
    let alive = true;
    loadPools()
      .then((pools) => alive && setState({ kind: 'ready', pools }))
      .catch(() => alive && setState({ kind: 'error' }));
    return () => {
      alive = false;
    };
  }, []);
  return state;
}

export interface MarketStats {
  offerings: number;
  reachedMin: number;
  raisedUsdc: number;
  raisedXlm: number;
  /** Share of the summed hard caps already subscribed, per currency-free count (0..1). */
  fillRatio: number;
}

/** Aggregates without mixing currencies: sums are per payment asset; the fill ratio is per offering. */
export function marketStats(pools: Pool[]): MarketStats {
  const ratios = pools.filter((p) => p.hardCap > 0).map((p) => Math.min(1, p.raisedAmount / p.hardCap));
  return {
    offerings: pools.length,
    reachedMin: pools.filter((p) => p.isSoftCapReached || p.raisedAmount >= p.softCap).length,
    raisedUsdc: pools.filter((p) => p.paymentKind !== 'XLM').reduce((s, p) => s + p.raisedAmount, 0),
    raisedXlm: pools.filter((p) => p.paymentKind === 'XLM').reduce((s, p) => s + p.raisedAmount, 0),
    fillRatio: ratios.length ? ratios.reduce((s, r) => s + r, 0) / ratios.length : 0,
  };
}

/** Open offerings first (closest to closing), then the most funded ones. */
export function featuredPools(pools: Pool[], count = 3): Pool[] {
  const open = pools.filter((p) => p.status === 'OPEN').sort((a, b) => a.daysRemaining - b.daysRemaining);
  const rest = pools
    .filter((p) => p.status !== 'OPEN')
    .sort((a, b) => b.raisedAmount / (b.hardCap || 1) - a.raisedAmount / (a.hardCap || 1));
  return [...open, ...rest].slice(0, count);
}

export const currencyOf = (p: Pool): string => (p.paymentKind === 'XLM' ? 'XLM' : 'USDC');

/** "Sur Infraestructura S.A. (CUIT 30-…)" → "Sur Infraestructura S.A." */
export function issuerName(p: Pool): string {
  const company = p.validation?.company as { legalName?: unknown } | undefined;
  const legal = typeof company?.legalName === 'string' ? company.legalName : '';
  return (legal || p.producerName || p.title).replace(/\s*\(CUIT[^)]*\)\s*$/, '');
}
