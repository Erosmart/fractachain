import type { Holding } from '@fractachain/shared';
import type { Pool, Portfolio, Position } from '@/core/api/types';
import type { Tone } from '@/components/ui/kit';

export interface Totals {
  costBasis: number;
  marketValue: number;
  pnl: number;
  pnlPct: number;
  pendingDividends: number;
}

/**
 * Positions to show: the API's marked-to-market book when loaded, otherwise
 * the session's holdings (priced at cost, no P/L) so the screen never starts empty.
 */
export function positionsFrom(
  book: Portfolio | null,
  holdings: Holding[] | undefined,
  pendingLabel: string,
): Position[] {
  if (book?.positions?.length) return book.positions;
  return (holdings || []).map((h) => ({
    listingId: h.listingId,
    tokenTicker: h.tokenTicker,
    legalName: h.tokenTicker,
    shares: h.tokens + (h.tokensOwed || 0),
    tokens: h.tokens,
    tokensOwed: h.tokensOwed || 0,
    tokensOnChain: h.tokensOnChain || 0,
    sdex: false,
    costBasis: h.usdcAmount,
    marketPrice: 0,
    marketValue: h.usdcAmount,
    pnl: 0,
    pnlPct: 0,
    priceSourceLabel: pendingLabel,
    pendingDividendUsdc: h.pendingDividendUsdc || 0,
    listingStatus: undefined,
    paymentKind: null,
    finalizeHash: null,
    refundedAt: h.refundedAt || null,
    refundHash: h.refundHash || null,
    canClaim: (h.tokensOwed || 0) > 0 && !h.refundedAt,
    canRefund: false,
  }));
}

export function totalsFrom(book: Portfolio | null, positions: Position[]): Totals {
  if (book?.totals) return book.totals;
  return {
    costBasis: positions.reduce((s, p) => s + p.costBasis, 0),
    marketValue: positions.reduce((s, p) => s + p.marketValue, 0),
    pnl: 0,
    pnlPct: 0,
    pendingDividends: positions.reduce((s, p) => s + (p.pendingDividendUsdc || 0), 0),
  };
}

/** Average entry price per token (cost / tokens). */
export const averagePrice = (p: Position) => (p.shares > 0 ? p.costBasis / p.shares : 0);

/** The position with the most recent quote (the API stamps each one with `priceAsOf`). */
export function newestQuote(positions: Position[]): { listingId: string; at: Date } | null {
  let best: { listingId: string; at: Date } | null = null;
  for (const p of positions as (Position & { priceAsOf?: string })[]) {
    const t = p.priceAsOf ? Date.parse(p.priceAsOf) : NaN;
    if (Number.isFinite(t) && (!best || t > best.at.getTime()))
      best = { listingId: p.listingId, at: new Date(t) };
  }
  return best;
}

/** The price source most positions use ("Precio de la licitación"). */
export function dominantSource(positions: Position[]): string | null {
  const counts = new Map<string, number>();
  for (const p of positions)
    if (p.priceSourceLabel) counts.set(p.priceSourceLabel, (counts.get(p.priceSourceLabel) ?? 0) + 1);
  let best: string | null = null;
  let n = 0;
  for (const [label, c] of counts) if (c > n) [best, n] = [label, c];
  return best;
}

/** Unit an offering is subscribed in. */
export const unitOf = (kind?: string | null) => (kind === 'XLM' ? 'XLM' : 'USDC');

/**
 * Elapsed day of an open offering ("día 12 de 30"), from when it was listed
 * and its length in days. `null` when it can't be told.
 */
export function offeringDay(
  listedAt: string | undefined,
  offeringDays: number | undefined,
  now: Date = new Date(),
): { day: number; total: number } | null {
  const start = listedAt ? Date.parse(listedAt) : NaN;
  const total = Math.round(Number(offeringDays));
  if (!Number.isFinite(start) || !(total > 0)) return null;
  const elapsed = Math.floor((now.getTime() - start) / 86_400_000) + 1;
  if (elapsed < 1) return null;
  return { day: Math.min(total, elapsed), total };
}
