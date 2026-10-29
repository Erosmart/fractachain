/**
 * Maps a Fractachain listing onto the Stellar DEX.
 *
 * The sandbox book stays as the fallback for listings without a real issuer;
 * once a listing has one, the book the UI renders is the ledger's.
 */
import { Asset, Operation, type Transaction, type xdr } from '@stellar/stellar-sdk';
import type { Listing } from '../../domain/listing/Listing';
import type { OrderSide } from '../../domain/market/SandboxBook';
import { isStellarPublicKey } from '../../domain/stellar/StellarAddress';
import { DomainError, NotConfiguredError, NotFoundError, ValidationError, errorMessage } from '../../shared/errors';
import { KeyedMutex } from '../../shared/KeyedMutex';
import type { ILogger } from '../../shared/logger';
import {
  securityAsset,
  type AccountOffer,
  type OrderBook,
  type SdexGateway,
  type SdexTrade,
  type SubmitResult,
} from '../../infrastructure/stellar/SdexGateway';
import { SignedTransactionPolicy } from '../../infrastructure/stellar/SignedTransactionPolicy';
import type { StellarClients } from '../../infrastructure/stellar/StellarClients';
import type { UsdcFaucet } from '../../infrastructure/stellar/UsdcFaucet';
import type { AccountService } from '../account/AccountService';
import type { CustodialKeyService } from '../account/CustodialKeyService';
import type { ComplianceService } from '../compliance/ComplianceService';
import type { ListingLedger } from '../listing/ListingLedger';

/** Circle's faucet USDC — what testnet books quoted against before the platform issuer existed. */
const LEGACY_USDC_ISSUER = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';

export interface SdexBookView extends OrderBook {
  listingId: string;
  tokenTicker: string;
  legalName: string;
  refPrice: number;
  lastPrice: number;
  trades: SdexTrade[];
  myOffers: (AccountOffer & { legacy?: boolean })[];
  legacyOffers: number;
  authorized: boolean;
  needsTrustline: boolean;
  tokenBalance: number;
  usdcBalance: number;
  usdcTotal: number;
  tokenTotal: number;
  sandbox: false;
}

export interface OrderParams {
  listingId: string;
  accountId: string;
  side: OrderSide;
  price: number;
  quantity: number;
  offerId?: string;
}

export interface CancelParams {
  listingId: string;
  accountId: string;
  side: OrderSide;
  offerId: string;
  price: number;
  legacy?: boolean;
}

export class SdexMarketService {
  private readonly inflightBooks = new Map<string, Promise<SdexBookView>>();
  /** Serializes payouts per holder+listing so a retry can never double-pay. */
  private readonly payoutLock = new KeyedMutex();

  constructor(
    private readonly listings: ListingLedger,
    private readonly accounts: AccountService,
    private readonly custody: CustodialKeyService,
    private readonly compliance: ComplianceService,
    private readonly sdex: SdexGateway,
    private readonly usdc: UsdcFaucet,
    private readonly clients: StellarClients,
    private readonly usdcCode: string,
    private readonly logger: ILogger,
  ) {}

  /** Classic USDC the pairs quote against — the same issuer the licitación escrow charges. */
  counterAsset(): Asset {
    const issuer = this.usdc.issuerPublicKey();
    if (!issuer) throw new NotConfiguredError('Falta el emisor USDC configurado (STELLAR_USDC_ISSUER_SECRET / deployments)');
    return new Asset(this.usdcCode, issuer);
  }

  /** The superseded Circle pair, testnet only (orders there are still real and still shown). */
  legacyCounterAsset(): Asset | null {
    const issuer = this.usdc.issuerPublicKey();
    if (!issuer || issuer === LEGACY_USDC_ISSUER || !this.clients.isTestnet()) return null;
    return new Asset(this.usdcCode, LEGACY_USDC_ISSUER);
  }

  listingAsset(listing: Listing): Asset {
    return securityAsset(listing.dossier.tokenTicker, listing.dossier.issuerPublicKey);
  }

  /** A listing trades on SDEX once it has a real issuing account. */
  available(listing: Listing): boolean {
    return isStellarPublicKey(listing.dossier.issuerPublicKey) && Boolean(listing.dossier.tokenTicker);
  }

  private requireListing(listingId: string): Listing {
    const listing = this.listings.get(listingId);
    if (!listing) throw new NotFoundError('Mercado no encontrado');
    if (!this.available(listing)) {
      throw new DomainError('Este listing todavía no tiene cuenta emisora en Stellar, así que no cotiza en el DEX');
    }
    return listing;
  }

  private requireWallet(accountId: string) {
    const account = this.accounts.get(accountId);
    if (!account?.publicKey) throw new DomainError('La cuenta no tiene wallet de Stellar asociada');
    return account;
  }

  /** Live book plus everything the caller needs to act on it (authorization read from the ledger). */
  book(listingId: string, accountId?: string): Promise<SdexBookView> {
    const key = `${listingId}:${accountId || ''}`;
    const pending = this.inflightBooks.get(key);
    if (pending) return pending;
    const next = this.loadBook(listingId, accountId).finally(() => this.inflightBooks.delete(key));
    this.inflightBooks.set(key, next);
    return next;
  }

  private async loadBook(listingId: string, accountId?: string): Promise<SdexBookView> {
    const listing = this.requireListing(listingId);
    const security = this.listingAsset(listing);
    const counter = this.counterAsset();
    const legacy = this.legacyCounterAsset();

    const [book, trades] = await Promise.all([
      this.sdex.orderBook(security, counter),
      this.sdex.recentTrades(security, counter, 100).catch(() => [] as SdexTrade[]),
    ]);

    // Orders resting on the old counter asset are merged in, flagged `legacy`.
    let mergedBook = book;
    let mergedTrades = trades;
    let legacyOffers = 0;
    if (legacy) {
      const [legacyBook, legacyTrades] = await Promise.all([
        this.sdex.orderBook(security, legacy).catch(() => null),
        this.sdex.recentTrades(security, legacy, 100).catch(() => [] as SdexTrade[]),
      ]);
      if (legacyBook) {
        const bids = [...book.bids, ...legacyBook.bids.map((b) => ({ ...b, legacy: true }))].sort((a, b) => b.price - a.price);
        const asks = [...book.asks, ...legacyBook.asks.map((a) => ({ ...a, legacy: true }))].sort((a, b) => a.price - b.price);
        const bestBid = bids[0]?.price ?? null;
        const bestAsk = asks[0]?.price ?? null;
        mergedBook = {
          ...book,
          bids,
          asks,
          spread: bestBid != null && bestAsk != null ? bestAsk - bestBid : null,
          midPrice: bestBid != null && bestAsk != null ? (bestAsk + bestBid) / 2 : bestBid ?? bestAsk,
        };
        mergedTrades = [...trades, ...legacyTrades.map((t) => ({ ...t, legacy: true }))]
          .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
          .slice(0, 150);
        legacyOffers = legacyBook.bids.length + legacyBook.asks.length;
      }
    }

    let myOffers: SdexBookView['myOffers'] = [];
    let authorized = false;
    let needsTrustline = true;
    let tokenBalance = 0;
    let usdcBalance = 0;
    let usdcTotal = 0;
    let tokenTotal = 0;

    const account = accountId ? this.accounts.get(accountId) : undefined;
    if (account?.publicKey) {
      const [offers, lines] = await Promise.all([
        this.sdex.accountOffers(account.publicKey).catch(() => [] as AccountOffer[]),
        this.sdex.trustlineStates(account.publicKey, [security, counter]),
      ]);
      const [line, counterLine] = lines;
      const legacyIssuer = legacy?.getIssuer();
      myOffers = offers
        .filter((o) => o.selling?.asset_code === security.getCode() || o.buying?.asset_code === security.getCode())
        .map((o) => ({
          ...o,
          legacy: Boolean(legacyIssuer && (o.selling?.asset_issuer === legacyIssuer || o.buying?.asset_issuer === legacyIssuer)),
        }));
      authorized = line.authorized;
      needsTrustline = !line.exists;
      // Resting offers are counted inside `balance`; liabilities are what they lock.
      tokenTotal = line.balance;
      usdcTotal = counterLine?.balance ?? 0;
      tokenBalance = Math.max(0, line.balance - line.sellingLiabilities);
      usdcBalance = Math.max(0, (counterLine?.balance ?? 0) - (counterLine?.sellingLiabilities ?? 0));
    }

    return {
      ...mergedBook,
      listingId,
      tokenTicker: listing.dossier.tokenTicker,
      legalName: listing.dossier.legalName,
      refPrice: listing.dossier.pricePerShareUsdc,
      lastPrice: mergedTrades[0]?.price ?? mergedBook.midPrice ?? listing.dossier.pricePerShareUsdc,
      trades: mergedTrades,
      myOffers,
      legacyOffers,
      authorized,
      needsTrustline,
      tokenBalance,
      usdcBalance,
      usdcTotal,
      tokenTotal,
      sandbox: false,
    };
  }

  /** Prepares an order for the investor to sign; nothing is submitted here. */
  async prepareOrder(params: OrderParams): Promise<{ xdr: string; summary: Record<string, unknown> }> {
    const listing = this.requireListing(params.listingId);
    const account = this.requireWallet(params.accountId);
    if (account.kycStatus !== 'APPROVED') throw new DomainError('Solo inversores con KYC aprobado pueden operar');
    if (!(params.price > 0) || !(params.quantity > 0)) throw new ValidationError('Precio o cantidad inválidos');

    const security = this.listingAsset(listing);
    const counter = this.counterAsset();
    // Fail with a readable reason rather than after the user signed.
    const [line, counterLine] = await this.sdex.trustlineStates(account.publicKey, [security, counter]);
    if (!line.exists) throw new DomainError(`Primero aprobá el token ${listing.dossier.tokenTicker} (trustline)`);
    if (!line.authorized) {
      throw new DomainError('Tu cuenta no está autorizada por el emisor para operar este activo. Necesitás el KYC aprobado.');
    }
    const req = {
      accountId: account.publicKey,
      security,
      counter,
      quantity: params.quantity,
      price: params.price,
      offerId: params.offerId,
      openCounterTrustline: !counterLine.exists,
    };
    const xdrOut = params.side === 'BUY' ? await this.sdex.buildBuyOfferXdr(req) : await this.sdex.buildSellOfferXdr(req);
    return {
      xdr: xdrOut,
      summary: {
        side: params.side,
        market: `${security.getCode()}/${counter.getCode()}`,
        quantity: params.quantity,
        price: params.price,
        estimatedTotal: Math.round(params.quantity * params.price * 1e6) / 1e6,
        venue: 'Stellar DEX',
      },
    };
  }

  /** One-shot path for custodial wallets: build, sign and submit. */
  async placeCustodialOrder(params: OrderParams) {
    const { xdr: unsigned, summary } = await this.prepareOrder(params);
    const result = await this.sdex.signAndSubmit(unsigned, this.custody.keypairFor(params.accountId));
    return { summary, hash: result.hash, book: await this.book(params.listingId, params.accountId) };
  }

  /** Cancel = order for zero at the same price; `legacy` targets the superseded pair. */
  async prepareCancel(params: CancelParams): Promise<{ xdr: string }> {
    const listing = this.requireListing(params.listingId);
    const account = this.requireWallet(params.accountId);
    const counter = (params.legacy && this.legacyCounterAsset()) || this.counterAsset();
    const counterLine = await this.sdex.trustlineState(account.publicKey, counter);
    const req = {
      accountId: account.publicKey,
      security: this.listingAsset(listing),
      counter,
      quantity: 0,
      price: params.price,
      offerId: params.offerId,
      openCounterTrustline: !counterLine.exists,
    };
    return { xdr: params.side === 'BUY' ? await this.sdex.buildBuyOfferXdr(req) : await this.sdex.buildSellOfferXdr(req) };
  }

  async cancelCustodialOrder(params: CancelParams): Promise<{ hash: string }> {
    const { xdr: unsigned } = await this.prepareCancel(params);
    const result = await this.sdex.signAndSubmit(unsigned, this.custody.keypairFor(params.accountId));
    return { hash: result.hash };
  }

  /** Trustline the investor signs to opt into the security (inert until authorized). */
  async prepareTrustline(params: { listingId: string; accountId: string; limit?: number }): Promise<{ xdr: string; tokenTicker: string }> {
    const listing = this.requireListing(params.listingId);
    const account = this.requireWallet(params.accountId);
    const xdrOut = await this.sdex.buildTrustlineXdr(account.publicKey, this.listingAsset(listing), params.limit);
    return { xdr: xdrOut, tokenTicker: listing.dossier.tokenTicker };
  }

  /** Custodial counterpart: open the line, then ask the issuer to authorize it. */
  async openCustodialTrustline(params: { listingId: string; accountId: string; limit?: number }) {
    const listing = this.requireListing(params.listingId);
    const account = this.requireWallet(params.accountId);
    if (account.kycStatus !== 'APPROVED') throw new DomainError('Solo inversores con KYC aprobado pueden aprobar el token');
    const line = await this.sdex.trustlineState(account.publicKey, this.listingAsset(listing));
    let hash: string | undefined;
    if (!line.exists) {
      const { xdr: unsigned } = await this.prepareTrustline(params);
      hash = (await this.sdex.signAndSubmit(unsigned, this.custody.keypairFor(params.accountId))).hash;
    }
    const compliance = await this.compliance.sync(account.publicKey, true);
    return { tokenTicker: listing.dossier.tokenTicker, hash, compliance, listingId: listing.id };
  }

  /**
   * Pays claimed platform-ledger tokens into the holder's real trustline.
   * `tokensOnChain` per holding makes retries idempotent (never double-pays).
   */
  distributeClaimedTokens(params: { listingId: string; accountId: string }) {
    return this.payoutLock.run(`${params.accountId}:${params.listingId}`, () => this.distributeUnlocked(params));
  }

  private async distributeUnlocked(params: { listingId: string; accountId: string }) {
    const listing = this.requireListing(params.listingId);
    const account = this.requireWallet(params.accountId);
    const holding = (account.holdings || []).find((h) => h.listingId === params.listingId);
    const pending = Math.max(0, (holding?.tokens || 0) - (holding?.tokensOnChain || 0));
    if (!holding || pending <= 0) throw new DomainError('No hay tokens reclamados pendientes de envío on-chain');

    const security = this.listingAsset(listing);
    if (account.custodyMode === 'CUSTODIAL') {
      await this.openCustodialTrustline({ listingId: listing.id, accountId: account.id });
    } else {
      const line = await this.sdex.trustlineState(account.publicKey, security);
      if (!line.exists) {
        throw new DomainError(`Primero aprobá el token ${listing.dossier.tokenTicker}: firmá la trustline desde el orderbook`);
      }
      if (!line.authorized) await this.compliance.sync(account.publicKey, true);
    }
    const result = await this.sdex.distributeTokens(account.publicKey, security, pending);
    this.accounts.markTokensOnChain(account.id, listing.id, pending);
    return { hash: result.hash, amount: pending, destination: account.publicKey, tokenTicker: listing.dossier.tokenTicker };
  }

  /**
   * Relays a transaction the investor signed in Freighter. Only the caller's
   * own trustline/offer operations are accepted — the platform is not an open
   * relay for arbitrary transactions.
   */
  async submitSigned(accountId: string, signedXdr: string): Promise<SubmitResult> {
    const account = this.requireWallet(accountId);
    const tx: Transaction = this.sdex.parseTransaction(signedXdr);
    SignedTransactionPolicy.assertSourcedBy(tx, account.publicKey);
    SignedTransactionPolicy.assertSdexOperations(tx);
    return this.sdex.submitSigned(tx);
  }

  /**
   * Maintenance tool (not run automatically): rebooks stranded legacy-pair
   * offers of custodial accounts onto the canonical pair.
   */
  async migrateLegacyPair(security: Asset, counter: Asset, legacy: Asset): Promise<void> {
    for (const offer of await this.sdex.pairOffers(security, legacy)) {
      const account = this.accounts.findByPublicKey(offer.seller);
      if (!account?.publicKey || account.custodyMode !== 'CUSTODIAL') continue;
      try {
        const secret = this.custody.secretOf(account);
        await this.usdc.fund(account.publicKey, { walletSecret: secret });
        const stroops = (decimal: string) => BigInt(Math.round(Number(decimal) * 1e7));
        const toAmount = (s: bigint) => `${s / 10_000_000n}.${String(s % 10_000_000n).padStart(7, '0')}`;
        const { n, d } = offer.priceR;
        let ops: xdr.Operation[];
        if (offer.side === 'SELL') {
          ops = [
            Operation.manageSellOffer({ selling: security, buying: legacy, amount: '0', price: { n, d }, offerId: offer.id }),
            Operation.manageSellOffer({ selling: security, buying: counter, amount: offer.amount, price: { n, d }, offerId: '0' }),
          ];
        } else {
          const buyStroops = (stroops(offer.amount) * BigInt(n)) / BigInt(d);
          if (buyStroops <= 0n) continue;
          ops = [
            Operation.manageBuyOffer({ buying: security, selling: legacy, buyAmount: '0', price: { n: d, d: n }, offerId: offer.id }),
            Operation.manageBuyOffer({ buying: security, selling: counter, buyAmount: toAmount(buyStroops), price: { n: d, d: n }, offerId: '0' }),
          ];
        }
        const unsigned = await this.sdex.buildOfferOpsXdr(account.publicKey, ops);
        await this.sdex.signAndSubmit(unsigned, this.custody.keypairFor(account.id));
      } catch (err) {
        this.logger.warn('migración de oferta legacy falló', { offerId: offer.id, err: errorMessage(err) });
      }
    }
  }
}
