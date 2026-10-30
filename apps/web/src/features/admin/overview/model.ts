import type { Listing } from '@fractachain/shared';
import type { KycQueueRow } from '@/core/api/AdminApi';
import { closingAt, ISSUANCE_STAGES, stageOf, type IssuanceStage } from '../issuance/model';

/** Raised vs cap for a set of offerings that settle in the same asset. */
export interface Funding {
  count: number;
  raised: number;
  cap: number;
}

export interface ConsoleSummary {
  /** Open offerings, split by settlement asset (never summed across assets). */
  openUsdc: Funding;
  openXlm: Funding;
  /** Successfully closed, by asset. */
  closedUsdc: Funding;
  closedXlm: Funding;
  stageCounts: Record<IssuanceStage, number>;
  total: number;
  /** Pending KYC, oldest first. */
  pendingKyc: KycQueueRow[];
  approvedInvestors: number;
  /** Open offerings by closing date, soonest first. */
  closings: { listing: Listing; at: Date }[];
  /** Listings that can't open or pay out: no payout wallet yet. */
  missingWallet: Listing[];
}

const emptyFunding = (): Funding => ({ count: 0, raised: 0, cap: 0 });

function add(f: Funding, l: Listing) {
  f.count += 1;
  f.raised += Number(l.raisedUsdc) || 0;
  f.cap += Number(l.dossier.offeringHardCapUsdc) || 0;
}

/** Everything the overview shows, derived from the API's own data. */
export function summarize(
  listings: readonly Listing[],
  kyc: readonly KycQueueRow[],
  payingIds: ReadonlySet<string> = new Set(),
): ConsoleSummary {
  const stageCounts = Object.fromEntries(ISSUANCE_STAGES.map((s) => [s, 0])) as Record<IssuanceStage, number>;
  const s: ConsoleSummary = {
    openUsdc: emptyFunding(),
    openXlm: emptyFunding(),
    closedUsdc: emptyFunding(),
    closedXlm: emptyFunding(),
    stageCounts,
    total: listings.length,
    pendingKyc: kyc
      .filter((r) => r.status === 'PENDING')
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    approvedInvestors: kyc.filter((r) => r.status === 'APPROVED').length,
    closings: [],
    missingWallet: [],
  };
  for (const l of listings) {
    const xlm = l.dossier.paymentKind === 'XLM';
    stageCounts[stageOf(l, payingIds.has(l.id))] += 1;
    if (l.status === 'LISTED') {
      add(xlm ? s.openXlm : s.openUsdc, l);
      const at = closingAt(l);
      if (at) s.closings.push({ listing: l, at });
    }
    if (l.status === 'CLOSED_SUCCESS') add(xlm ? s.closedXlm : s.closedUsdc, l);
    const beforeClose = l.status !== 'CLOSED_SUCCESS' && l.status !== 'CLOSED_FAILED';
    if (beforeClose && !String(l.dossier.proceedsWallet || '').trim()) s.missingWallet.push(l);
  }
  s.closings.sort((a, b) => a.at.getTime() - b.at.getTime());
  return s;
}

/** Share of the cap raised, 0–100, rounded. */
export function percentOfCap(f: Funding): number {
  return f.cap > 0 ? Math.round(Math.min(1, f.raised / f.cap) * 100) : 0;
}
