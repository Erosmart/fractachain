/**
 * Mark-to-market for tokenized shares.
 *
 * No external price oracle. The live quote is the SDEX book (last trade, then
 * mid). Listings without a real issuer fall back to the sandbox matcher, then
 * to the IPO price from the dossier. That last one is a reference, not a
 * market — we label it so the portfolio does not pretend BYMA printed it.
 */
import { getListing, listListings, type Listing } from '../admin/listings';
import { economicShares, getAccount } from '../auth/accounts';
import { getBook } from './orderbook';
import { counterAsset, listingAsset, sdexAvailable } from './sdex_book';
import { getOrderBook, getRecentTrades } from '../stellar/sdex';
import { listDividends } from './dividends';

export type PriceSource = 'sdex_last' | 'sdex_mid' | 'sandbox_last' | 'ipo';

export interface MarketQuote {
  listingId: string;
  tokenTicker: string;
  legalName: string;
  price: number;
  source: PriceSource;
  asOf: string;
}

const SOURCE_LABEL: Record<PriceSource, string> = {
  sdex_last: 'Último cruce SDEX',
  sdex_mid: 'Mid del libro SDEX',
  sandbox_last: 'Último cruce (sandbox)',
  ipo: 'Precio de la licitación',
};

export function priceSourceLabel(source: PriceSource) {
  return SOURCE_LABEL[source];
}

export async function quoteListing(listing: Listing): Promise<MarketQuote> {
  const ipo = listing.dossier.pricePerShareUsdc;
  const base = {
    listingId: listing.id,
    tokenTicker: listing.dossier.tokenTicker,
    legalName: listing.dossier.legalName,
  };

  if (sdexAvailable(listing)) {
    try {
      const security = listingAsset(listing);
      const counter = counterAsset();
      const [book, trades] = await Promise.all([
        getOrderBook(security, counter).catch(() => null),
        getRecentTrades(security, counter, 5).catch(() => [] as Awaited<ReturnType<typeof getRecentTrades>>),
      ]);
      const last = trades[0];
      if (last && last.price > 0) {
        return { ...base, price: last.price, source: 'sdex_last', asOf: last.createdAt };
      }
      if (book?.midPrice && book.midPrice > 0) {
        return { ...base, price: book.midPrice, source: 'sdex_mid', asOf: new Date().toISOString() };
      }
    } catch {
      // Horizon down: fall through to the local book rather than blanking the portfolio.
    }
  }

  try {
    const sandbox = getBook(listing.id);
    if (sandbox.trades?.length && sandbox.lastPrice > 0) {
      return {
        ...base,
        price: sandbox.lastPrice,
        source: 'sandbox_last',
        asOf: sandbox.trades[0]?.createdAt || new Date().toISOString(),
      };
    }
  } catch {
    // listing without a book yet
  }

  return {
    ...base,
    price: ipo,
    source: 'ipo',
    asOf: listing.closedAt || listing.listedAt || listing.createdAt,
  };
}

export async function buildPortfolio(accountId: string) {
  const account = getAccount(accountId);
  if (!account) throw new Error('Cuenta no encontrada');

  const listings = listListings();
  const positions = await Promise.all(
    (account.holdings || []).map(async (h) => {
      const listing = listings.find((l) => l.id === h.listingId) || getListing(h.listingId);
      const shares = economicShares(h);
      const quote = listing
        ? await quoteListing(listing)
        : {
            listingId: h.listingId,
            tokenTicker: h.tokenTicker,
            legalName: h.tokenTicker,
            price: 0,
            source: 'ipo' as PriceSource,
            asOf: new Date().toISOString(),
          };
      const marketValue = Math.round(shares * quote.price * 1e6) / 1e6;
      const costBasis = Math.round((h.usdcAmount || 0) * 1e6) / 1e6;
      const pnl = Math.round((marketValue - costBasis) * 1e6) / 1e6;
      const pendingDividendUsdc = Math.round((h.pendingDividendUsdc || 0) * 1e6) / 1e6;
      const onChain = listing ? listing.dossier.paymentKind === 'XLM' : false;
      const listingStatus = listing?.status || 'UNKNOWN';
      return {
        listingId: h.listingId,
        tokenTicker: h.tokenTicker,
        legalName: listing?.dossier.legalName || h.tokenTicker,
        shares,
        tokens: h.tokens,
        tokensOwed: h.tokensOwed || 0,
        tokensOnChain: h.tokensOnChain || 0,
        sdex: listing ? sdexAvailable(listing) : false,
        costBasis,
        marketPrice: quote.price,
        marketValue,
        pnl,
        pnlPct: costBasis > 0 ? Math.round((pnl / costBasis) * 10000) / 100 : 0,
        priceSource: quote.source,
        priceSourceLabel: priceSourceLabel(quote.source),
        priceAsOf: quote.asOf,
        pendingDividendUsdc,
        distributions: listDividends(h.listingId).slice(0, 3),
        listingStatus,
        paymentKind: listing?.dossier.paymentKind || null,
        finalizeHash: listing?.finalizeHash || null,
        refundedAt: h.refundedAt || null,
        refundHash: h.refundHash || null,
        canClaim: listingStatus === 'CLOSED_SUCCESS' && (h.tokensOwed || 0) > 0 && !h.refundedAt,
        canRefund: onChain && listingStatus === 'CLOSED_FAILED' && !h.refundedAt && ((h.tokensOwed || 0) > 0 || (h.tokens || 0) > 0 || (h.usdcAmount || 0) > 0),
      };
    }),
  );

  const costBasis = positions.reduce((s, p) => s + p.costBasis, 0);
  const marketValue = positions.reduce((s, p) => s + p.marketValue, 0);
  const pendingDividends = positions.reduce((s, p) => s + p.pendingDividendUsdc, 0);
  const pnl = Math.round((marketValue - costBasis) * 1e6) / 1e6;

  return {
    cashUsdc: account.cashUsdc,
    positions,
    totals: {
      costBasis: Math.round(costBasis * 1e6) / 1e6,
      marketValue: Math.round(marketValue * 1e6) / 1e6,
      pnl,
      pnlPct: costBasis > 0 ? Math.round((pnl / costBasis) * 10000) / 100 : 0,
      pendingDividends: Math.round(pendingDividends * 1e6) / 1e6,
    },
  };
}
