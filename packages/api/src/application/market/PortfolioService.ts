/**
 * Mark-to-market for tokenized shares.
 *
 * No external oracle: the live quote is the SDEX book (last trade, then mid).
 * Listings without a real issuer fall back to the sandbox book, then to the
 * offering price — labelled as such, so the portfolio never pretends BYMA
 * printed it.
 */
import { economicShares } from '../../domain/account/Account';
import type { Listing } from '../../domain/listing/Listing';
import { pct, round6 } from '../../shared/numbers';
import type { Explorer } from '../../infrastructure/stellar/Explorer';
import type { HorizonAccounts } from '../../infrastructure/stellar/HorizonAccounts';
import type { SdexGateway, SdexTrade } from '../../infrastructure/stellar/SdexGateway';
import type { UsdcFaucet } from '../../infrastructure/stellar/UsdcFaucet';
import type { AccountService } from '../account/AccountService';
import type { ListingLedger } from '../listing/ListingLedger';
import type { DividendService } from './DividendService';
import type { SandboxOrderBookService } from './SandboxOrderBookService';
import type { SdexMarketService } from './SdexMarketService';

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

export class PortfolioService {
  constructor(
    private readonly accounts: AccountService,
    private readonly listings: ListingLedger,
    private readonly sandbox: SandboxOrderBookService,
    private readonly sdexMarket: SdexMarketService,
    private readonly sdex: SdexGateway,
    private readonly dividends: DividendService,
    private readonly horizon: HorizonAccounts,
    private readonly usdc: UsdcFaucet,
    private readonly explorer: Explorer,
  ) {}

  async quote(listing: Listing): Promise<MarketQuote> {
    const base = { listingId: listing.id, tokenTicker: listing.dossier.tokenTicker, legalName: listing.dossier.legalName };
    if (this.sdexMarket.available(listing)) {
      try {
        const security = this.sdexMarket.listingAsset(listing);
        const counter = this.sdexMarket.counterAsset();
        const [book, trades] = await Promise.all([
          this.sdex.orderBook(security, counter).catch(() => null),
          this.sdex.recentTrades(security, counter, 5).catch(() => [] as SdexTrade[]),
        ]);
        const last = trades[0];
        if (last && last.price > 0) return { ...base, price: last.price, source: 'sdex_last', asOf: last.createdAt };
        if (book?.midPrice && book.midPrice > 0) {
          return { ...base, price: book.midPrice, source: 'sdex_mid', asOf: new Date().toISOString() };
        }
      } catch {
        // Horizon down: fall through to the local book rather than blanking the portfolio.
      }
    }
    try {
      const book = this.sandbox.book(listing.id);
      if (book.trades?.length && book.lastPrice > 0) {
        return { ...base, price: book.lastPrice, source: 'sandbox_last', asOf: book.trades[0]?.createdAt || new Date().toISOString() };
      }
    } catch {
      // listing without a book yet
    }
    return { ...base, price: listing.dossier.pricePerShareUsdc, source: 'ipo', asOf: listing.closedAt || listing.listedAt || listing.createdAt };
  }

  async build(accountId: string) {
    const account = this.accounts.require(accountId);
    const listings = this.listings.list();
    // One quote per listing, shared by every holding of it.
    const quotes = new Map<string, Promise<MarketQuote>>();
    const quoteOf = (l: Listing) => {
      if (!quotes.has(l.id)) quotes.set(l.id, this.quote(l));
      return quotes.get(l.id)!;
    };
    const usdcIssuer = this.usdc.issuerPublicKey();

    const [positions, usdcOnChain, xlmOnChain] = await Promise.all([
      Promise.all(
        (account.holdings || []).map(async (h) => {
          const listing = listings.find((l) => l.id === h.listingId) || this.listings.get(h.listingId);
          const shares = economicShares(h);
          const quote: MarketQuote = listing
            ? await quoteOf(listing)
            : { listingId: h.listingId, tokenTicker: h.tokenTicker, legalName: h.tokenTicker, price: 0, source: 'ipo', asOf: new Date().toISOString() };
          const marketValue = round6(shares * quote.price);
          const costBasis = round6(h.usdcAmount || 0);
          const pnl = round6(marketValue - costBasis);
          const onChainXlm = listing ? listing.dossier.paymentKind === 'XLM' : false;
          const listingStatus = listing?.status || 'UNKNOWN';
          return {
            listingId: h.listingId,
            tokenTicker: h.tokenTicker,
            legalName: listing?.dossier.legalName || h.tokenTicker,
            shares,
            tokens: h.tokens,
            tokensOwed: h.tokensOwed || 0,
            tokensOnChain: h.tokensOnChain || 0,
            sdex: listing ? this.sdexMarket.available(listing) : false,
            costBasis,
            marketPrice: quote.price,
            marketValue,
            pnl,
            pnlPct: pct(pnl, costBasis),
            priceSource: quote.source,
            priceSourceLabel: SOURCE_LABEL[quote.source],
            priceAsOf: quote.asOf,
            pendingDividendUsdc: round6(h.pendingDividendUsdc || 0),
            distributions: this.dividends.list(h.listingId).slice(0, 3),
            listingStatus,
            paymentKind: listing?.dossier.paymentKind || null,
            finalizeHash: listing?.finalizeHash || null,
            refundedAt: h.refundedAt || null,
            refundHash: h.refundHash || null,
            canClaim: listingStatus === 'CLOSED_SUCCESS' && (h.tokensOwed || 0) > 0 && !h.refundedAt,
            canRefund:
              onChainXlm &&
              listingStatus === 'CLOSED_FAILED' &&
              !h.refundedAt &&
              ((h.tokensOwed || 0) > 0 || (h.tokens || 0) > 0 || (h.usdcAmount || 0) > 0),
          };
        }),
      ),
      account.publicKey && usdcIssuer ? this.horizon.assetBalance(account.publicKey, 'USDC', usdcIssuer) : Promise.resolve(0),
      account.publicKey ? this.horizon.nativeXlm(account.publicKey) : Promise.resolve(0),
    ]);

    // On-chain truth: SDEX buys never touch the platform ledger, so the wallet's
    // classic balance per tradable listing is what the holder actually owns.
    if (account.publicKey) {
      const tradable = listings.filter((l) => this.sdexMarket.available(l));
      const balances = await Promise.all(
        tradable.map((l) =>
          this.horizon
            .assetBalance(account.publicKey, l.dossier.tokenTicker, l.dossier.issuerPublicKey)
            .then((b) => [l, b] as const)
            .catch(() => [l, 0] as const),
        ),
      );
      for (const [listing, bal] of balances) {
        const pos = positions.find((p) => p.listingId === listing.id);
        if (pos) {
          pos.tokensOnChain = bal;
          pos.shares = bal + (pos.tokensOwed || 0);
          pos.marketValue = round6(pos.shares * pos.marketPrice);
          pos.pnl = round6(pos.marketValue - pos.costBasis);
          pos.pnlPct = pct(pos.pnl, pos.costBasis);
        } else if (bal > 0) {
          const quote = await quoteOf(listing);
          const marketValue = round6(bal * quote.price);
          positions.push({
            listingId: listing.id,
            tokenTicker: listing.dossier.tokenTicker,
            legalName: listing.dossier.legalName,
            shares: bal,
            tokens: 0,
            tokensOwed: 0,
            tokensOnChain: bal,
            sdex: true,
            // Bought on the DEX: no platform cost basis exists, P&L starts flat.
            costBasis: marketValue,
            marketPrice: quote.price,
            marketValue,
            pnl: 0,
            pnlPct: 0,
            priceSource: quote.source,
            priceSourceLabel: SOURCE_LABEL[quote.source],
            priceAsOf: quote.asOf,
            pendingDividendUsdc: 0,
            distributions: this.dividends.list(listing.id).slice(0, 3),
            listingStatus: listing.status,
            paymentKind: listing.dossier.paymentKind || null,
            finalizeHash: listing.finalizeHash || null,
            refundedAt: null,
            refundHash: null,
            canClaim: false,
            canRefund: false,
          });
        }
      }
    }

    // What the company sees: offerings whose raise is paid into this wallet.
    const proceeds = account.publicKey
      ? listings
          .filter((l) => l.dossier.proceedsWallet?.toUpperCase() === account.publicKey.toUpperCase())
          .map((l) => ({
            listingId: l.id,
            tokenTicker: l.dossier.tokenTicker,
            legalName: l.dossier.legalName,
            status: l.status,
            paymentKind: l.dossier.paymentKind,
            amount: l.raisedUsdc,
            paidAt: l.proceedsPaidAt || null,
            finalizeHash: l.finalizeHash || null,
            explorer: this.explorer.tx(l.finalizeHash),
          }))
      : [];

    const costBasis = positions.reduce((s, p) => s + p.costBasis, 0);
    const marketValue = positions.reduce((s, p) => s + p.marketValue, 0);
    const pendingDividends = positions.reduce((s, p) => s + p.pendingDividendUsdc, 0);
    const pnl = round6(marketValue - costBasis);
    return {
      cashUsdc: account.cashUsdc,
      usdcOnChain,
      xlmOnChain,
      proceeds,
      positions,
      totals: {
        costBasis: round6(costBasis),
        marketValue: round6(marketValue),
        pnl,
        pnlPct: pct(pnl, costBasis),
        pendingDividends: round6(pendingDividends),
      },
    };
  }
}
