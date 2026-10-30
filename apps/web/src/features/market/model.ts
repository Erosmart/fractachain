import type { ListingDetail, ListingOnChain, Pool } from '@/core/api/types';

// Offering phases live in core (one mapper for every screen); re-exported for this feature.
export {
  CLOSING_SOON_MS,
  LIVE_PHASES,
  offeringPhase,
  poolPhase,
  positionPhase,
  type OfferingPhase,
  type PhaseInput,
} from '@/core/market/phase';

/** Snapshot fields the API sends but the shared type does not declare yet. */
export type OnChainSnapshot = ListingOnChain & { deadline?: string | null; proceedsWithdrawn?: boolean };

export function listingDeadlineMs(listing: ListingDetail, validationDeadline?: unknown): number | null {
  const fromChain = (listing.onChain as OnChainSnapshot | undefined)?.deadline;
  const candidates = [
    fromChain,
    typeof validationDeadline === 'string' ? validationDeadline : null,
    listing.settleAt,
  ];
  for (const c of candidates) {
    const ms = c ? new Date(c).getTime() : NaN;
    if (Number.isFinite(ms)) return ms;
  }
  if (listing.listedAt && listing.dossier.offeringDays > 0) {
    const listed = new Date(listing.listedAt).getTime();
    if (Number.isFinite(listed)) return listed + listing.dossier.offeringDays * 86_400_000;
  }
  return null;
}

/** Company name out of the catalog's "Sur S.A. (CUIT 30-…)". */
export function companyName(pool: Pick<Pool, 'producerName' | 'title'>): string {
  const fromProducer = pool.producerName.replace(/\s*\(CUIT[^)]*\)\s*$/i, '').trim();
  if (fromProducer) return fromProducer;
  const parts = pool.title.split(' · ');
  return parts[parts.length - 1] ?? pool.title;
}

export { money, unitOf, type PaymentUnit } from '@/core/market/money';

export function percentOf(part: number, whole: number): number {
  if (!(whole > 0)) return 0;
  return Math.max(0, Math.min(100, Math.round((part / whole) * 100)));
}

export interface TimeLeft {
  days: number;
  hours: number;
  minutes: number;
  done: boolean;
}

export function timeLeft(deadlineMs: number, now = Date.now()): TimeLeft {
  const ms = Math.max(0, deadlineMs - now);
  return {
    days: Math.floor(ms / 86_400_000),
    hours: Math.floor((ms % 86_400_000) / 3_600_000),
    minutes: Math.floor((ms % 3_600_000) / 60_000),
    done: ms === 0,
  };
}

export interface AmountCheck {
  ok: boolean;
  /** i18n key under `offerings.invest.errors`, when not ok. */
  error?: 'empty' | 'belowMin' | 'aboveCapacity' | 'aboveBalance';
}

/** Validates a subscription amount against the offering's floor and what is left of the cap. */
export function checkAmount(
  amount: number,
  { min, capacity, balance }: { min: number; capacity: number; balance?: number },
): AmountCheck {
  if (!(amount > 0)) return { ok: false, error: 'empty' };
  if (min > 0 && amount < min) return { ok: false, error: 'belowMin' };
  if (capacity >= 0 && amount > capacity + 1e-9) return { ok: false, error: 'aboveCapacity' };
  if (balance !== undefined && amount > balance + 1e-9) return { ok: false, error: 'aboveBalance' };
  return { ok: true };
}

/** Tokens a subscription buys at the offering price (4 decimals, like the contract display). */
export function tokensFor(amount: number, price: number): number {
  if (!(price > 0) || !(amount > 0)) return 0;
  return Math.floor((amount / price) * 1e4) / 1e4;
}

export interface CurvePoint {
  /** YYYY-MM-DD */
  date: string;
  /** Cumulative amount raised at the end of that day. */
  cumulative: number;
  /** Contributed that day. */
  daily: number;
}

const dayKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * Cumulative subscription curve, one point per calendar day from the first
 * logged contribution to `until` (today, or the closing day), so quiet days
 * show as flat steps. Amounts raised before dates were logged are the
 * starting base. Long offerings keep the last `maxDays`.
 */
export function subscriptionCurve(
  daily: { date: string; usdc: number }[],
  {
    undated = 0,
    until = Date.now(),
    maxDays = 60,
  }: { undated?: number; until?: number; maxDays?: number } = {},
): CurvePoint[] {
  const byDay = new Map<string, number>();
  for (const d of daily) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date)) continue;
    byDay.set(d.date, (byDay.get(d.date) ?? 0) + (Number(d.usdc) || 0));
  }
  if (byDay.size === 0) return [];
  const days = [...byDay.keys()].sort();
  const start = Date.parse(`${days[0]}T00:00:00Z`);
  const lastLogged = Date.parse(`${days[days.length - 1]}T00:00:00Z`);
  const end = Math.max(lastLogged, Date.parse(`${dayKey(until)}T00:00:00Z`));
  const points: CurvePoint[] = [];
  let running = undated;
  for (let t = start; t <= end; t += 86_400_000) {
    const key = dayKey(t);
    const amount = byDay.get(key) ?? 0;
    running += amount;
    points.push({ date: key, cumulative: running, daily: amount });
  }
  return points.slice(-maxDays);
}
