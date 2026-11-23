/**
 * Stellar DEX (SDEX) integration for Fractachain security tokens.
 *
 * SDEX is a native central limit order book with strict price-time priority
 * and no AMM in the path: orders live in the ledger, cross deterministically,
 * and every wallet and explorer can read them.
 *
 * It also enforces KYC: tokens are issued with `AUTH_REQUIRED`, so a trustline
 * is inert until the issuer authorizes it. A holder compliance has not
 * approved cannot hold, receive or offer the token — the ledger rejects it.
 * Revocation is symmetric: clearing the flag freezes the balance and the
 * network pulls the holder's open offers.
 */
import {
  Asset,
  AuthClawbackEnabledFlag,
  AuthRequiredFlag,
  AuthRevocableFlag,
  BASE_FEE,
  Horizon,
  Keypair,
  Operation,
  Transaction,
  TransactionBuilder,
  type xdr,
} from '@stellar/stellar-sdk';
import { DomainError, UpstreamError, ValidationError } from '../../shared/errors';
import type { PlatformKeyring } from './PlatformKeyring';
import type { StellarClients } from './StellarClients';

const STROOP_DECIMALS = 7;
/** BASE_FEE is the floor, not a good default under load. */
const FEE = String(Number(BASE_FEE) * 100);
const TX_TIMEOUT_SECONDS = 180;
const READ_TTL_MS = 2000;

export interface OrderBookLevel {
  price: number;
  amount: number;
  /** Cumulative amount from the top of the book down to this level. */
  total: number;
  /** Level lives on the superseded counter-asset pair, not the canonical one. */
  legacy?: boolean;
}

export interface OrderBook {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  spread: number | null;
  midPrice: number | null;
  base: { code: string; issuer: string };
  counter: { code: string; issuer: string };
  source: 'sdex';
}

export interface TrustlineState {
  exists: boolean;
  /** True only when the issuer has approved this holder. */
  authorized: boolean;
  /** Limited approval: can close out existing offers, cannot take on more. */
  maintainingLiabilitiesOnly: boolean;
  balance: number;
  buyingLiabilities: number;
  sellingLiabilities: number;
  limit: number;
}

export interface SdexTrade {
  id: string;
  price: number;
  amount: number;
  buyer: string;
  seller: string;
  createdAt: string;
  legacy?: boolean;
}

export interface AccountOffer {
  id: string;
  selling: { asset_code?: string; asset_issuer?: string; asset_type?: string };
  buying: { asset_code?: string; asset_issuer?: string; asset_type?: string };
  amount: number;
  price: number;
  priceR?: { n: number; d: number };
  lastModified: string;
}

export interface PairOffer {
  id: string;
  seller: string;
  amount: string;
  priceR: { n: number; d: number };
  side: 'BUY' | 'SELL';
}

export interface OfferRequest {
  /** The investor's own account. */
  accountId: string;
  security: Asset;
  counter: Asset;
  /** Quantity of the security. `0` on an existing offer id cancels it. */
  quantity: number;
  /** Price of one security token in the counter asset. */
  price: number;
  /** Prepend a `changeTrust` for the counter asset so one signature covers both. */
  openCounterTrustline?: boolean;
  offerId?: string;
}

export interface SubmitResult {
  hash: string;
  ledger?: number;
}

type CacheEntry<T> = { at: number; value: T };

/** Formats a number as a Stellar amount string (7 decimals). */
export function toStellarAmount(value: number): string {
  if (!Number.isFinite(value) || value <= 0) throw new ValidationError('Monto inválido');
  return value.toFixed(STROOP_DECIMALS);
}

/** Classic asset for a tokenized security (alphanum4/12 picked by length). */
export function securityAsset(code: string, issuer: string): Asset {
  const trimmed = code.trim().toUpperCase();
  if (trimmed.length < 1 || trimmed.length > 12) {
    throw new ValidationError(`Código de activo inválido: "${code}" (1 a 12 caracteres)`);
  }
  return new Asset(trimmed, issuer);
}

interface HorizonErrorShape {
  message?: string;
  response?: { data?: { extras?: { result_codes?: { operations?: string[]; transaction?: string } } } };
}

/** Turns Horizon's nested result codes into something an operator can act on. */
export function describeHorizonError(err: unknown): string {
  const e = err as HorizonErrorShape;
  const codes = e?.response?.data?.extras?.result_codes;
  const opCodes = codes?.operations ?? [];
  const txCode = codes?.transaction;
  if (opCodes.includes('op_not_authorized')) {
    return 'La cuenta no está autorizada para operar este activo. Aprobá el KYC para habilitar la trustline.';
  }
  if (opCodes.includes('op_no_trust'))
    return 'La cuenta no tiene trustline con el token. Tiene que aprobarlo antes de operar.';
  if (opCodes.includes('op_underfunded')) return 'Saldo insuficiente para cubrir la orden.';
  if (opCodes.includes('op_line_full')) return 'La orden excede el límite de la trustline del comprador.';
  if (opCodes.includes('op_cross_self')) return 'La orden cruzaría contra una orden propia.';
  if (txCode === 'tx_insufficient_balance')
    return 'La cuenta no tiene XLM suficiente para la reserva y la comisión.';
  if (opCodes.length || txCode)
    return `Stellar rechazó la operación (${txCode ?? ''} ${opCodes.join(', ')}).`.trim();
  return e?.message || 'Error desconocido al enviar la transacción a Stellar.';
}

export class SdexGateway {
  private readonly bookCache = new Map<string, CacheEntry<OrderBook>>();
  private readonly tradesCache = new Map<string, CacheEntry<SdexTrade[]>>();
  private readonly inflight = new Map<string, Promise<unknown>>();

  constructor(
    private readonly clients: StellarClients,
    private readonly keyring: PlatformKeyring,
  ) {}

  /* ---------------------------- issuer: compliance perimeter ---------------------------- */

  /**
   * Turns on `AUTH_REQUIRED | AUTH_REVOCABLE` (+ optional clawback) on the
   * platform issuer. Run before distributing any token: it does not
   * retroactively deauthorize existing trustlines.
   */
  async configureIssuerForRegulatedAsset(opts?: { clawback?: boolean }): Promise<SubmitResult> {
    const issuer = await this.keyring.ensurePlatformIssuer();
    let flags = AuthRequiredFlag | AuthRevocableFlag;
    if (opts?.clawback) flags |= AuthClawbackEnabledFlag;
    return this.buildAndSubmit(
      issuer.publicKey(),
      (b) => b.addOperation(Operation.setOptions({ setFlags: flags as never })),
      [issuer],
    );
  }

  /** On-chain half of a KYC approval: the issuer authorizes the holder's trustline. */
  async authorizeHolder(asset: Asset, trustor: string): Promise<SubmitResult> {
    const issuer = this.keyring.issuerFor(asset.getIssuer() || '');
    return this.buildAndSubmit(
      issuer.publicKey(),
      (b) => b.addOperation(Operation.setTrustLineFlags({ trustor, asset, flags: { authorized: true } })),
      [issuer],
    );
  }

  /**
   * Withdraws authorization. A full revocation freezes the balance and pulls
   * open offers; `allowUnwind` keeps `authorizedToMaintainLiabilities` so a
   * lapsed KYC can close positions but not open new ones.
   */
  async deauthorizeHolder(
    asset: Asset,
    trustor: string,
    opts?: { allowUnwind?: boolean },
  ): Promise<SubmitResult> {
    const issuer = this.keyring.issuerFor(asset.getIssuer() || '');
    const flags = opts?.allowUnwind
      ? { authorized: false, authorizedToMaintainLiabilities: true }
      : { authorized: false, authorizedToMaintainLiabilities: false };
    return this.buildAndSubmit(
      issuer.publicKey(),
      (b) => b.addOperation(Operation.setTrustLineFlags({ trustor, asset, flags })),
      [issuer],
    );
  }

  /** Issuer pays `amount` of `asset` into `destination`'s (authorized) trustline. */
  async distributeTokens(destination: string, asset: Asset, amount: number): Promise<SubmitResult> {
    const issuer = this.keyring.issuerFor(asset.getIssuer() || '');
    return this.buildAndSubmit(
      issuer.publicKey(),
      (b) => b.addOperation(Operation.payment({ destination, asset, amount: toStellarAmount(amount) })),
      [issuer],
    );
  }

  /* ---------------------------------- trustlines ---------------------------------- */

  /** One `loadAccount` for every asset (v1 paid one round-trip per asset). */
  async trustlineStates(accountId: string, assets: Asset[]): Promise<TrustlineState[]> {
    if (assets.length === 0) return [];
    try {
      const account = await this.clients.horizon().loadAccount(accountId);
      return assets.map((asset) => SdexGateway.trustlineFromAccount(account, asset));
    } catch {
      return assets.map(() => SdexGateway.emptyTrustline());
    }
  }

  async trustlineState(accountId: string, asset: Asset): Promise<TrustlineState> {
    const [line] = await this.trustlineStates(accountId, [asset]);
    return line ?? SdexGateway.emptyTrustline();
  }

  async issuerRequiresAuth(issuer: string): Promise<boolean> {
    try {
      const account = await this.clients.horizon().loadAccount(issuer);
      return Boolean((account as unknown as { flags?: { auth_required?: boolean } }).flags?.auth_required);
    } catch {
      return false;
    }
  }

  /* ---------------------------------- market data ---------------------------------- */

  invalidateReads(): void {
    this.bookCache.clear();
    this.tradesCache.clear();
  }

  async orderBook(security: Asset, counter: Asset, limit = 20): Promise<OrderBook> {
    return this.cached('book', this.bookCache, SdexGateway.pairKey(security, counter, String(limit)), () =>
      this.fetchOrderBook(security, counter, limit).catch((err) => {
        throw new UpstreamError(`Horizon no devolvió el libro: ${describeHorizonError(err)}`);
      }),
    );
  }

  /** Recent trades, newest first, prices always in counter-per-security. */
  async recentTrades(security: Asset, counter: Asset, limit = 20): Promise<SdexTrade[]> {
    return this.cached(
      'trades',
      this.tradesCache,
      SdexGateway.pairKey(security, counter, String(limit)),
      () =>
        this.fetchRecentTrades(security, counter, limit).catch((err) => {
          throw new UpstreamError(`Horizon no devolvió los trades: ${describeHorizonError(err)}`);
        }),
    );
  }

  async accountOffers(accountId: string): Promise<AccountOffer[]> {
    const page = await this.clients
      .horizon()
      .offers()
      .forAccount(accountId)
      .limit(50)
      .call()
      .catch((err) => {
        throw new UpstreamError(describeHorizonError(err));
      });
    return page.records.map((o) => ({
      id: String(o.id),
      selling: o.selling as AccountOffer['selling'],
      buying: o.buying as AccountOffer['buying'],
      amount: Number(o.amount),
      price: Number(o.price),
      priceR: o.price_r ? { n: Number(o.price_r.n), d: Number(o.price_r.d) } : undefined,
      lastModified: o.last_modified_time,
    }));
  }

  /** Raw offers on one exact pair, both directions, tagged from the security's side. */
  async pairOffers(security: Asset, counter: Asset): Promise<PairOffer[]> {
    const query = (selling: Asset, buying: Asset, side: 'BUY' | 'SELL') =>
      this.clients
        .horizon()
        .offers()
        .selling(selling)
        .buying(buying)
        .limit(100)
        .call()
        .then((p) =>
          (p.records || []).map((o) => ({
            id: String(o.id),
            seller: String(o.seller),
            amount: String(o.amount),
            priceR: { n: Number(o.price_r?.n ?? 0), d: Number(o.price_r?.d ?? 1) },
            side,
          })),
        )
        .catch(() => [] as PairOffer[]);
    const [asks, bids] = await Promise.all([
      query(security, counter, 'SELL'),
      query(counter, security, 'BUY'),
    ]);
    return [...asks, ...bids];
  }

  /* ---------------------------------- transaction building ---------------------------------- */

  async buildOfferOpsXdr(accountId: string, ops: xdr.Operation[]): Promise<string> {
    const builder = await this.builderFor(accountId);
    for (const op of ops) builder.addOperation(op);
    return builder.setTimeout(TX_TIMEOUT_SECONDS).build().toXDR();
  }

  /** Unsigned sell order; the investor signs it in their own wallet. */
  async buildSellOfferXdr(req: OfferRequest): Promise<string> {
    const builder = await this.builderFor(req.accountId);
    if (req.openCounterTrustline) builder.addOperation(Operation.changeTrust({ asset: req.counter }));
    builder.addOperation(
      Operation.manageSellOffer({
        selling: req.security,
        buying: req.counter,
        amount: req.quantity === 0 ? '0' : toStellarAmount(req.quantity),
        price: String(req.price),
        offerId: req.offerId ?? '0',
      }),
    );
    return builder.setTimeout(TX_TIMEOUT_SECONDS).build().toXDR();
  }

  /**
   * Unsigned buy order. `manageBuyOffer` fixes the quantity of the security
   * acquired; `price` is still counter-per-security, like the sell side.
   */
  async buildBuyOfferXdr(req: OfferRequest): Promise<string> {
    const builder = await this.builderFor(req.accountId);
    if (req.openCounterTrustline) builder.addOperation(Operation.changeTrust({ asset: req.counter }));
    builder.addOperation(
      Operation.manageBuyOffer({
        selling: req.counter,
        buying: req.security,
        buyAmount: req.quantity === 0 ? '0' : toStellarAmount(req.quantity),
        price: String(req.price),
        offerId: req.offerId ?? '0',
      }),
    );
    return builder.setTimeout(TX_TIMEOUT_SECONDS).build().toXDR();
  }

  async buildTrustlineXdr(accountId: string, asset: Asset, limit?: number): Promise<string> {
    const builder = await this.builderFor(accountId);
    builder.addOperation(
      Operation.changeTrust({ asset, ...(limit !== undefined ? { limit: toStellarAmount(limit) } : {}) }),
    );
    return builder.setTimeout(TX_TIMEOUT_SECONDS).build().toXDR();
  }

  /** Parses a signed classic transaction for this network. Throws a 400 on garbage input. */
  parseTransaction(signedXdr: string): Transaction {
    try {
      const tx = TransactionBuilder.fromXDR(signedXdr, this.clients.networkPassphrase());
      if (!(tx instanceof Transaction)) throw new Error('fee bump');
      return tx;
    } catch {
      throw new ValidationError('El XDR firmado no es una transacción válida para esta red');
    }
  }

  /** Relays a transaction the investor already signed. */
  async submitSigned(tx: Transaction): Promise<SubmitResult> {
    try {
      const result = await this.clients.horizon().submitTransaction(tx);
      this.invalidateReads();
      return { hash: result.hash, ledger: result.ledger };
    } catch (err) {
      throw new DomainError(describeHorizonError(err));
    }
  }

  /** Signs and submits for a platform-custodied wallet. */
  async signAndSubmit(unsignedXdr: string, signer: Keypair): Promise<SubmitResult> {
    const tx = new Transaction(unsignedXdr, this.clients.networkPassphrase());
    tx.sign(signer);
    return this.submitSigned(tx);
  }

  /** Builds, signs and submits ops from `sourcePublicKey` (issuer / faucet paths). */
  async buildAndSubmit(
    sourcePublicKey: string,
    addOps: (b: TransactionBuilder) => TransactionBuilder,
    signers: Keypair[],
  ): Promise<SubmitResult> {
    const builder = await this.builderFor(sourcePublicKey);
    const tx = addOps(builder).setTimeout(TX_TIMEOUT_SECONDS).build();
    signers.forEach((s) => tx.sign(s));
    try {
      const result = await this.clients.horizon().submitTransaction(tx);
      this.invalidateReads();
      return { hash: result.hash, ledger: result.ledger };
    } catch (err) {
      throw new UpstreamError(describeHorizonError(err));
    }
  }

  /* ---------------------------------- internals ---------------------------------- */

  private async builderFor(accountId: string): Promise<TransactionBuilder> {
    let account: Horizon.AccountResponse;
    try {
      account = await this.clients.horizon().loadAccount(accountId);
    } catch {
      throw new DomainError('La cuenta no existe en la red todavía (fondeala con XLM primero)');
    }
    return new TransactionBuilder(account, { fee: FEE, networkPassphrase: this.clients.networkPassphrase() });
  }

  private async fetchOrderBook(security: Asset, counter: Asset, limit: number): Promise<OrderBook> {
    const raw = await this.clients.horizon().orderbook(security, counter).limit(limit).call();
    const level = (rows: Array<{ price: string; amount: string }>): OrderBookLevel[] => {
      let running = 0;
      return rows.map((r) => {
        const amount = Number(r.amount);
        running += amount;
        return { price: Number(r.price), amount, total: running };
      });
    };
    const bids = level(raw.bids);
    const asks = level(raw.asks);
    const bestBid = bids[0]?.price ?? null;
    const bestAsk = asks[0]?.price ?? null;
    return {
      bids,
      asks,
      spread: bestBid !== null && bestAsk !== null ? bestAsk - bestBid : null,
      midPrice: bestBid !== null && bestAsk !== null ? (bestAsk + bestBid) / 2 : null,
      base: { code: security.getCode(), issuer: security.getIssuer() || 'native' },
      counter: { code: counter.getCode(), issuer: counter.getIssuer() || 'native' },
      source: 'sdex',
    };
  }

  private async fetchRecentTrades(security: Asset, counter: Asset, limit: number): Promise<SdexTrade[]> {
    const page = await this.clients
      .horizon()
      .trades()
      .forAssetPair(security, counter)
      .order('desc')
      .limit(limit)
      .call();
    return page.records.map((t) => {
      const rec = t as unknown as {
        id: string;
        base_asset_code?: string;
        base_asset_issuer?: string;
        price?: { n: string | number; d: string | number };
        base_is_seller: boolean;
        base_account?: string;
        counter_account?: string;
        base_amount: string;
        counter_amount: string;
        ledger_close_time: string;
      };
      const securityIsBase =
        rec.base_asset_code === security.getCode() && rec.base_asset_issuer === security.getIssuer();
      const n = Number(rec.price?.n ?? 0);
      const d = Number(rec.price?.d ?? 1);
      const raw = d === 0 ? 0 : n / d;
      // `base_is_seller` tells which account delivered the base asset.
      const seller = rec.base_is_seller ? rec.base_account : rec.counter_account;
      const buyer = rec.base_is_seller ? rec.counter_account : rec.base_account;
      return {
        id: String(rec.id),
        price: securityIsBase ? raw : raw === 0 ? 0 : 1 / raw,
        amount: Number(securityIsBase ? rec.base_amount : rec.counter_amount),
        buyer: String((securityIsBase ? buyer : seller) ?? ''),
        seller: String((securityIsBase ? seller : buyer) ?? ''),
        createdAt: rec.ledger_close_time,
      };
    });
  }

  private cached<T>(
    namespace: string,
    map: Map<string, CacheEntry<T>>,
    key: string,
    produce: () => Promise<T>,
  ): Promise<T> {
    const hit = map.get(key);
    if (hit && Date.now() - hit.at < READ_TTL_MS) return Promise.resolve(hit.value);
    // Book and trades share the pair key: the in-flight map must keep them apart.
    const flightKey = `${namespace}:${key}`;
    const pending = this.inflight.get(flightKey) as Promise<T> | undefined;
    if (pending) return pending;
    const next = produce()
      .then((value) => {
        map.set(key, { at: Date.now(), value });
        return value;
      })
      .finally(() => this.inflight.delete(flightKey));
    this.inflight.set(flightKey, next);
    return next;
  }

  private static pairKey(security: Asset, counter: Asset, extra = ''): string {
    return `${security.getCode()}:${security.getIssuer() || 'native'}|${counter.getCode()}:${counter.getIssuer() || 'native'}|${extra}`;
  }

  private static emptyTrustline(): TrustlineState {
    return {
      exists: false,
      authorized: false,
      maintainingLiabilitiesOnly: false,
      balance: 0,
      buyingLiabilities: 0,
      sellingLiabilities: 0,
      limit: 0,
    };
  }

  private static trustlineFromAccount(account: Horizon.AccountResponse, asset: Asset): TrustlineState {
    const line = account.balances.find(
      (b) =>
        b.asset_type !== 'native' &&
        b.asset_type !== 'liquidity_pool_shares' &&
        b.asset_code === asset.getCode() &&
        b.asset_issuer === asset.getIssuer(),
    ) as
      | {
          is_authorized?: boolean;
          is_authorized_to_maintain_liabilities?: boolean;
          balance: string;
          buying_liabilities?: string;
          selling_liabilities?: string;
          limit: string;
        }
      | undefined;
    if (!line) return SdexGateway.emptyTrustline();
    return {
      exists: true,
      authorized: Boolean(line.is_authorized),
      maintainingLiabilitiesOnly: !line.is_authorized && Boolean(line.is_authorized_to_maintain_liabilities),
      balance: Number(line.balance),
      buyingLiabilities: Number(line.buying_liabilities || 0),
      sellingLiabilities: Number(line.selling_liabilities || 0),
      limit: Number(line.limit),
    };
  }
}
