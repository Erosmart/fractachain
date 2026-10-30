import type { ChainAsset, ChainTender } from '@fractachain/shared';
import type { PhaseInput } from '@/core/market/phase';

/** A Soroban contract address (C… strkey). */
export const isContractId = (id: unknown): id is string =>
  typeof id === 'string' && /^C[A-Z2-7]{55}$/.test(id);

/** The tender as the page shows it: every figure read from the contract. */
export interface TenderView {
  contractId: string;
  explorer: string;
  reads: string[];
  readAt: string;
  stateName: ChainTender['state']['name'];
  /** Platform-shaped status derived from the contract state (for the phase chip). */
  status: PhaseInput['status'];
  raised: number;
  price: number;
  softCap: number | null;
  hardCap: number | null;
  deadlineMs: number | null;
  asset: ChainAsset;
  /** Payment asset code for every label ("USDC", "XLM"). */
  code: string;
  fiduciary: string | null;
  proceedsWithdrawn: boolean;
  holder: { address: string; rwa: number; payment: number } | null;
}

export function statusFromChain(name: ChainTender['state']['name']): PhaseInput['status'] {
  if (name === 'Open') return 'LISTED';
  if (name === 'Failed') return 'CLOSED_FAILED';
  return 'CLOSED_SUCCESS';
}

export function tenderView(t: ChainTender): TenderView {
  const deadline = t.deadline ? Date.parse(t.deadline) : NaN;
  return {
    contractId: t.contractId,
    explorer: t.explorer,
    reads: t.reads ?? [],
    readAt: t.readAt,
    stateName: t.state.name,
    status: statusFromChain(t.state.name),
    raised: Number(t.totalRaised) || 0,
    price: Number(t.pricePerUnit) || 0,
    softCap: t.softCap ?? null,
    hardCap: t.hardCap ?? null,
    deadlineMs: Number.isFinite(deadline) ? deadline : null,
    asset: t.paymentToken,
    code: t.paymentToken?.code || '—',
    fiduciary: t.fiduciary,
    proceedsWithdrawn: Boolean(t.proceedsWithdrawn),
    holder: t.holder
      ? {
          address: t.holder.address,
          rwa: Number(t.holder.rwaBalance) || 0,
          payment: Number(t.holder.paymentBalance) || 0,
        }
      : null,
  };
}

export interface ContributionCheck {
  ok: boolean;
  /** i18n key under `offerings.invest.errors`. */
  error?: 'empty' | 'belowMin' | 'aboveCapacity' | 'aboveBalance' | 'notMultiple';
}

/**
 * What the contract will accept: a positive amount, a whole number of units
 * (`require_divisible(amount, price)`), within what is left of the cap and of
 * the investor's balance; the issuer's minimum on top.
 */
export function checkContribution(
  amount: number,
  {
    price,
    min,
    capacity,
    balance,
  }: { price: number; min: number; capacity: number | null; balance?: number | null },
): ContributionCheck {
  if (!(amount > 0)) return { ok: false, error: 'empty' };
  if (min > 0 && amount + 1e-9 < min) return { ok: false, error: 'belowMin' };
  if (price > 0) {
    const units = amount / price;
    if (Math.abs(units - Math.round(units)) > 1e-7) return { ok: false, error: 'notMultiple' };
  }
  if (capacity !== null && amount > capacity + 1e-9) return { ok: false, error: 'aboveCapacity' };
  if (balance !== undefined && balance !== null && amount > balance + 1e-9)
    return { ok: false, error: 'aboveBalance' };
  return { ok: true };
}

/** Units the contract mints for `amount` (whole units only). */
export const unitsFor = (amount: number, price: number) =>
  price > 0 && amount > 0 ? Math.floor(amount / price + 1e-9) : 0;
