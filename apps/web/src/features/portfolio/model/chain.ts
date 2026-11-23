import type { ChainAsset, ChainPortfolio, TenderStateName } from '@fractachain/shared';
import type { Portfolio, Position } from '@/core/api/types';
import type { OfferingPhase } from '@/core/market/phase';

/**
 * A holding as the portfolio shows it: units, price and state read from the
 * tender contract (`get_rwa_balance`, `get_price_per_unit`, `get_state`).
 * Platform records only add the labels and the DEX-token bookkeeping used by
 * the actions (receive, claim).
 */
export interface ChainHolding {
  listingId: string;
  contractId: string;
  explorer: string;
  ticker: string;
  title: string;
  units: number;
  price: number;
  value: number;
  code: string;
  asset: ChainAsset;
  stateName: TenderStateName;
  /** Platform bookkeeping of the classic (DEX) token, when it exists. */
  tokens: number;
  tokensOwed: number;
  tokensOnChain: number;
  sdex: boolean;
  finalizeHash: string | null;
}

export interface ChainWallet {
  address: string;
  readAt: string;
  xlm: number;
  usdc: { asset: ChainAsset; balance: number; trustline: boolean } | null;
}

const short = (id: string) => (id.length > 14 ? `${id.slice(0, 5)}…${id.slice(-5)}` : id);

export function holdingsFromChain(chain: ChainPortfolio | null, book: Portfolio | null): ChainHolding[] {
  if (!chain) return [];
  const byListing = new Map<string, Position>((book?.positions ?? []).map((p) => [p.listingId, p]));
  return chain.positions
    .filter((p) => p.rwaBalance > 0)
    .map((p) => {
      const listingId = p.listingId ?? p.tender.contractId;
      const recorded = byListing.get(listingId);
      const units = Number(p.rwaBalance) || 0;
      const price = Number(p.pricePerUnit) || 0;
      return {
        listingId,
        contractId: p.tender.contractId,
        explorer: p.tender.explorer,
        ticker: recorded?.tokenTicker || p.title || short(p.tender.contractId),
        // Without a platform ticker the title is already the heading: don't repeat it.
        title: recorded?.tokenTicker ? recorded.legalName || p.title || '' : '',
        units,
        price,
        value: units * price,
        code: p.paymentToken?.code || '—',
        asset: p.paymentToken,
        stateName: p.state,
        tokens: recorded?.tokens ?? 0,
        tokensOwed: recorded?.tokensOwed ?? 0,
        tokensOnChain: recorded?.tokensOnChain ?? 0,
        sdex: Boolean(recorded?.sdex),
        finalizeHash: recorded?.finalizeHash ?? null,
      };
    });
}

export function walletFromChain(chain: ChainPortfolio | null): ChainWallet | null {
  if (!chain) return null;
  return { address: chain.address, readAt: chain.readAt, xlm: Number(chain.xlm) || 0, usdc: chain.usdc };
}

/** The offering phase a holding is in, from the contract state alone. */
export function holdingPhase(h: Pick<ChainHolding, 'stateName' | 'units'>): OfferingPhase {
  switch (h.stateName) {
    case 'Open':
      return 'open';
    case 'Failed':
      return h.units > 0 ? 'refundAvailable' : 'failed';
    default:
      return 'closed';
  }
}

export interface ValueByCode {
  code: string;
  value: number;
}

/** Holdings value per payment asset: USDC and XLM are never added together. */
export function valueByCode(holdings: ChainHolding[]): ValueByCode[] {
  const totals = new Map<string, number>();
  for (const h of holdings) totals.set(h.code, (totals.get(h.code) ?? 0) + h.value);
  return [...totals.entries()]
    .map(([code, value]) => ({ code, value }))
    .sort((a, b) => (a.code === 'USDC' ? -1 : b.code === 'USDC' ? 1 : a.code.localeCompare(b.code)));
}

/** Value of the holdings priced in `code` (the portfolio's headline uses USDC). */
export const valueIn = (holdings: ChainHolding[], code: string) =>
  holdings.filter((h) => h.code === code).reduce((s, h) => s + h.value, 0);
