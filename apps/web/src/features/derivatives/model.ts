import type { ChainAsset, ChainForward, ChainRef, ChainWarrant } from '@fractachain/shared';
import type { Tone } from '@/components/ui/kit';

/**
 * View models for the read-only contract views (Instaward 1, Deliverable 3b).
 * Every value here comes from a contract read (`/api/chain/*`); the mappers
 * only rename, parse dates and pick the status tone — they never fill in a
 * number the chain did not return.
 */

/** Where a card's values were read from. */
export interface ReadSource {
  contractId: string;
  shortId: string;
  explorer: string;
  reads: string[];
  readAt: Date | null;
}

export interface AssetLabel {
  code: string;
  contractId: string;
  explorer: string;
}

export type ForwardStateKey = 'active' | 'fulfilled' | 'cancelled' | 'unknown';
export type WarrantStatusKey = 'deposited' | 'activeLoan' | 'repaid' | 'liquidated' | 'unknown';

export interface ForwardView {
  source: ReadSource;
  stateKey: ForwardStateKey;
  /** Raw contract value, shown when the state is unknown to this UI. */
  stateRaw: string;
  tone: Tone;
  crop: string;
  kilos: number;
  producer: string | null;
  buyer: string | null;
  arbiter: string | null;
  position: {
    delivered: boolean;
    deliveredAt: Date | null;
    disputed: boolean;
    harvestDeadline: Date | null;
    rollovers: number;
    escrow: number;
  } | null;
  asset: AssetLabel;
}

export interface WarrantView {
  source: ReadSource;
  statusKey: WarrantStatusKey;
  statusRaw: string;
  tone: Tone;
  loanAmount: number;
  producer: string | null;
  terms: {
    inventoryValue: number;
    ltvPct: number;
    interestPct: number;
    fundedAt: Date | null;
    dueAt: Date | null;
    offerExpiresAt: Date | null;
  } | null;
  asset: AssetLabel;
}

/** `CABC…WXYZ` — enough to recognize an ID, the full one is in the link. */
export function shortId(id: string, head = 4, tail = 4): string {
  return id && id.length > head + tail + 1 ? `${id.slice(0, head)}…${id.slice(-tail)}` : id || '—';
}

/** ISO string or Unix seconds → Date; empty, zero or invalid → null. */
export function parseChainDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === '' || value === 0 || value === '0') return null;
  if (typeof value === 'number' || (typeof value === 'string' && /^\d+$/.test(value))) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return null;
    // Contracts store Unix seconds; anything that large is already milliseconds.
    const d = new Date(n < 1e12 ? n * 1000 : n);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === 'string') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

export function readSource(ref: ChainRef & { reads?: string[]; readAt?: string }): ReadSource {
  return {
    contractId: ref.contractId,
    shortId: shortId(ref.contractId),
    explorer: ref.explorer,
    reads: Array.isArray(ref.reads) ? ref.reads.filter((r) => typeof r === 'string' && r) : [],
    readAt: parseChainDate(ref.readAt),
  };
}

export function assetLabel(asset: ChainAsset | null | undefined): AssetLabel {
  return {
    code: text(asset?.code) ?? '—',
    contractId: asset?.contractId ?? '',
    explorer: asset?.explorer ?? '',
  };
}

/** Contract enum names → UI keys. Accepts the enum name or its numeric value. */
const FORWARD_STATES: Record<string, ForwardStateKey> = {
  active: 'active',
  '0': 'active',
  fulfilled: 'fulfilled',
  '1': 'fulfilled',
  cancelled: 'cancelled',
  canceled: 'cancelled',
  '2': 'cancelled',
};

const FORWARD_TONES: Record<ForwardStateKey, Tone> = {
  active: 'sky',
  fulfilled: 'good',
  cancelled: 'neutral',
  unknown: 'neutral',
};

const WARRANT_STATES: Record<string, WarrantStatusKey> = {
  deposited: 'deposited',
  '0': 'deposited',
  activeloan: 'activeLoan',
  active_loan: 'activeLoan',
  '1': 'activeLoan',
  repaid: 'repaid',
  '2': 'repaid',
  liquidated: 'liquidated',
  '3': 'liquidated',
};

const WARRANT_TONES: Record<WarrantStatusKey, Tone> = {
  deposited: 'neutral',
  activeLoan: 'sky',
  repaid: 'good',
  liquidated: 'bad',
  unknown: 'neutral',
};

export function forwardState(raw: unknown): ForwardStateKey {
  return (
    FORWARD_STATES[
      String(raw ?? '')
        .trim()
        .toLowerCase()
    ] ?? 'unknown'
  );
}

export function warrantStatus(raw: unknown): WarrantStatusKey {
  return (
    WARRANT_STATES[
      String(raw ?? '')
        .trim()
        .toLowerCase()
    ] ?? 'unknown'
  );
}

/** Basis points → percent (6000 → 60). */
export const bpsToPct = (bps: unknown): number => Math.round(num(bps)) / 100;

export function forwardView(f: ChainForward): ForwardView {
  const stateKey = forwardState(f.state);
  const p = f.position;
  return {
    source: readSource(f),
    stateKey,
    stateRaw: String(f.state ?? ''),
    tone: FORWARD_TONES[stateKey],
    crop: text(f.cropName) ?? '—',
    kilos: num(f.totalKilos),
    producer: text(f.parties?.producer),
    buyer: text(f.parties?.buyer),
    arbiter: text(f.arbiter),
    position: p
      ? {
          delivered: Boolean(p.delivered),
          deliveredAt: parseChainDate(p.deliveredAt),
          disputed: Boolean(p.disputed),
          harvestDeadline: parseChainDate(p.harvestDeadline),
          rollovers: num(p.rollovers),
          escrow: num(p.escrow),
        }
      : null,
    asset: assetLabel(f.paymentToken),
  };
}

export function warrantView(w: ChainWarrant): WarrantView {
  const statusKey = warrantStatus(w.status);
  const t = w.terms;
  return {
    source: readSource(w),
    statusKey,
    statusRaw: String(w.status ?? ''),
    tone: WARRANT_TONES[statusKey],
    loanAmount: num(w.loanAmount),
    producer: text(w.producer),
    terms: t
      ? {
          inventoryValue: num(t.inventoryValue),
          ltvPct: bpsToPct(t.ltvBps),
          interestPct: bpsToPct(t.interestRateBps),
          fundedAt: parseChainDate(t.fundedAt),
          dueAt: parseChainDate(t.dueAt),
          offerExpiresAt: parseChainDate(t.offerExpiresAt),
        }
      : null,
    asset: assetLabel(w.paymentToken),
  };
}

/** Kilos as the screen shows them: tons from 1 000 kg up. */
export function weight(kilos: number): { value: number; unit: 'kg' | 't' } {
  return kilos >= 1000 ? { value: Math.round(kilos / 10) / 100, unit: 't' } : { value: kilos, unit: 'kg' };
}
