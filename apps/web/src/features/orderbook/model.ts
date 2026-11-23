import type { OrderSide } from '@fractachain/shared';
import type { BookTrade, SandboxBook, SdexBook, SdexLevel, SdexOffer } from '@/core/api/types';

export interface Level {
  price: number;
  amount: number;
  total: number;
  depthPercent: number;
  legacy?: boolean;
}

export interface MyOrder {
  id: string;
  side: OrderSide;
  price: number;
  amount: number;
  remaining: number;
  status: string;
  /** Posted against the superseded counter asset — stranded on a dead pair. */
  legacy?: boolean;
}

/** One order book shape for both venues, so the screen renders a single model. */
export interface Book {
  listingId: string;
  tokenTicker: string;
  legalName: string;
  refPrice: number;
  lastPrice: number;
  spread: number | null;
  asks: Level[];
  bids: Level[];
  trades: BookTrade[];
  myOrders: MyOrder[];
  reservedCash?: number;
  reservedTokens?: number;
  /** Sandbox book only: its own demo cash (not a wallet balance). */
  demoCash?: number;
  /** 'sdex' is the real Stellar order book; 'sandbox' is the local matcher. */
  venue: 'sdex' | 'sandbox';
  /** SDEX only: whether the issuer has authorized this holder's trustline. */
  authorized?: boolean;
  needsTrustline?: boolean;
  tokenBalance?: number;
  usdcBalance?: number;
  usdcTotal?: number;
  tokenTotal?: number;
}

/** Which resting level the form price came from, so the UI shows what is left to take. */
export interface TakenLevel {
  from: 'ask' | 'bid';
  price: number;
  available: number;
}

export const fmtQty = (n: number) =>
  n.toLocaleString('es-AR', { maximumFractionDigits: 4, minimumFractionDigits: 0 });

/**
 * Folds an SDEX response into the shape the book UI renders.
 *
 * Two mismatches to reconcile: SDEX reports `total` as a cumulative quantity
 * while the sandbox reports it as a notional value, and SDEX has no depth
 * percentage because Horizon does not compute one.
 */
export function fromSdex(d: SdexBook): Book {
  const level = (rows: SdexLevel[]): Level[] => {
    const max = Math.max(1, ...rows.map((r) => r.amount));
    return rows.map((r) => ({
      price: r.price,
      amount: r.amount,
      total: r.price * r.amount,
      depthPercent: Math.round((r.amount / max) * 100),
      legacy: r.legacy,
    }));
  };

  const ticker = d.tokenTicker;
  const myOrders: MyOrder[] = (d.myOffers || []).map((o: SdexOffer) => {
    // An offer selling the security is a sell; anything else in this market is buying it.
    const side: OrderSide = o.selling?.asset_code === ticker ? 'SELL' : 'BUY';
    return {
      id: o.id,
      side,
      price: side === 'SELL' ? o.price : o.price === 0 ? 0 : 1 / o.price,
      amount: o.amount,
      remaining: o.amount,
      status: 'OPEN',
      legacy: o.legacy,
    };
  });

  return {
    listingId: d.listingId,
    tokenTicker: ticker,
    legalName: d.legalName,
    refPrice: d.refPrice,
    lastPrice: d.lastPrice,
    spread: d.spread,
    asks: level(d.asks || []),
    bids: level(d.bids || []),
    trades: Array.isArray(d.trades) ? d.trades : [],
    myOrders,
    venue: 'sdex',
    authorized: d.authorized,
    needsTrustline: d.needsTrustline,
    tokenBalance: d.tokenBalance,
    usdcBalance: d.usdcBalance,
    usdcTotal: d.usdcTotal,
    tokenTotal: d.tokenTotal,
  };
}

export function fromSandbox(d: SandboxBook): Book {
  return {
    ...d,
    trades: Array.isArray(d?.trades) ? d.trades : [],
    venue: 'sandbox',
  };
}

export interface Candle {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

/**
 * Buckets trades into `N` OHLCV candles. Buckets without trades stay flat at
 * the previous close — and the first ones at the reference (IPO) price — so a
 * series is always visible.
 */
export function buildCandles(
  trades: { price: number; amount?: number; createdAt: string }[],
  refPrice: number,
  now = Date.now(),
): Candle[] {
  const sorted = (Array.isArray(trades) ? trades : [])
    .map((tr) => ({ t: new Date(tr.createdAt).getTime(), p: tr.price, v: Number(tr.amount) || 0 }))
    .filter((tr) => Number.isFinite(tr.t) && tr.p > 0)
    .sort((a, b) => a.t - b.t);

  const N = 44;
  const LEAD = 4;
  const tFirst = sorted[0]?.t ?? now;
  const tLast = sorted[sorted.length - 1]?.t ?? tFirst;
  const dt = Math.max(tLast - tFirst, 60_000) / (N - LEAD);
  const t0 = tFirst - LEAD * dt;

  const out: Candle[] = Array.from({ length: N }, (_, i) => ({
    t: t0 + i * dt,
    o: 0,
    h: -Infinity,
    l: Infinity,
    c: 0,
    v: 0,
  }));
  for (const tr of sorted) {
    const i = Math.min(N - 1, Math.max(0, Math.floor((tr.t - t0) / dt)));
    const b = out[i];
    b.h = Math.max(b.h, tr.p);
    b.l = Math.min(b.l, tr.p);
    b.c = tr.p;
    b.v += tr.v;
  }
  let prev = refPrice;
  for (const b of out) {
    if (!Number.isFinite(b.h)) {
      b.c = prev;
      b.h = prev;
      b.l = prev;
    }
    b.o = prev;
    b.h = Math.max(b.h, b.o);
    b.l = Math.min(b.l, b.o);
    prev = b.c;
  }
  return out;
}
