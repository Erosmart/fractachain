import type { Pool, Position } from '@/core/api/types';

/**
 * Where an offering stands, in the investor's words (benchmark §3). Every
 * screen derives its chip from here, so raw contract states ("Successful",
 * "Failed", "finalize()") never reach the UI.
 */
export type OfferingPhase =
  | 'upcoming'
  | 'open'
  | 'closingSoon'
  | 'minReached'
  | 'capFilled'
  | 'closed'
  | 'failed'
  | 'refundAvailable'
  | 'payingIncome'
  | 'expired'
  /** Only for a position: the investor already got the money back. */
  | 'refunded';

/** Phases in which money can still come in. */
export const LIVE_PHASES: ReadonlySet<OfferingPhase> = new Set([
  'open',
  'closingSoon',
  'minReached',
  'capFilled',
]);

/** "Cierra pronto" threshold. */
export const CLOSING_SOON_MS = 3 * 86_400_000;

export interface PhaseInput {
  /** Platform status of the listing. */
  status: 'DRAFT' | 'DEPLOYED' | 'TOKENS_MINTED' | 'LISTED' | 'CLOSED_SUCCESS' | 'CLOSED_FAILED';
  /** On-chain state name when the contract is live ("Open", "Successful", "Failed", "Terminated"). */
  stateName?: string;
  raised: number;
  softCap: number;
  hardCap: number;
  /** Closing deadline (ms since epoch), when known. */
  deadlineMs?: number | null;
  now?: number;
  /** The signed-in investor contributed and has not been refunded yet. */
  hasRefundableContribution?: boolean;
  /** Income was already distributed to holders. */
  hasDividends?: boolean;
}

export function offeringPhase(input: PhaseInput): OfferingPhase {
  const now = input.now ?? Date.now();
  const failed = input.status === 'CLOSED_FAILED' || input.stateName === 'Failed';
  const success =
    input.status === 'CLOSED_SUCCESS' || input.stateName === 'Successful' || input.stateName === 'Terminated';
  if (failed) return input.hasRefundableContribution ? 'refundAvailable' : 'failed';
  if (success) return input.hasDividends ? 'payingIncome' : 'closed';
  if (input.status !== 'LISTED') return 'upcoming';

  const reachedMin = input.softCap > 0 && input.raised >= input.softCap;
  if (input.hardCap > 0 && input.raised >= input.hardCap) return 'capFilled';
  const deadline = input.deadlineMs ?? null;
  if (deadline !== null && deadline <= now) return reachedMin ? 'minReached' : 'expired';
  if (reachedMin) return 'minReached';
  if (deadline !== null && deadline - now <= CLOSING_SOON_MS) return 'closingSoon';
  return 'open';
}

const POOL_STATUS: Record<Pool['status'], PhaseInput['status']> = {
  OPEN: 'LISTED',
  SUCCESSFUL: 'CLOSED_SUCCESS',
  FAILED: 'CLOSED_FAILED',
  SETTLED: 'CLOSED_SUCCESS',
};

export function poolPhase(pool: Pool, now = Date.now()): OfferingPhase {
  const open = pool.status === 'OPEN';
  return offeringPhase({
    status: POOL_STATUS[pool.status] ?? 'LISTED',
    raised: pool.raisedAmount,
    softCap: pool.softCap,
    hardCap: pool.hardCap,
    // The catalog only carries whole days left; good enough for a card chip.
    deadlineMs: open ? now + Math.max(0, pool.daysRemaining) * 86_400_000 : null,
    now,
  });
}

/** State of the offering behind a portfolio position, from the investor's side. */
export function positionPhase(
  p: Pick<Position, 'listingStatus' | 'refundedAt' | 'canRefund'>,
): OfferingPhase | null {
  if (p.refundedAt) return 'refunded';
  if (p.canRefund) return 'refundAvailable';
  switch (p.listingStatus) {
    case 'LISTED':
      return 'open';
    case 'CLOSED_SUCCESS':
      return 'closed';
    case 'CLOSED_FAILED':
      return 'failed';
    case 'DRAFT':
    case 'DEPLOYED':
    case 'TOKENS_MINTED':
      return 'upcoming';
    default:
      return null;
  }
}
