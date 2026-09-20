/**
 * Stellar DEX (SDEX) integration for Fractachain security tokens.
 *
 * Why SDEX and not an in-house matching engine: SDEX is a native central limit
 * order book with strict price-time priority and no AMM in the path. Orders
 * live in the ledger, cross deterministically at settlement, and every wallet
 * and explorer in the ecosystem can already read them.
 *
 * Why this also solves KYC: the token is issued with `AUTH_REQUIRED`, so a
 * trustline is inert until the issuer authorizes it. An account the compliance
 * team has not approved cannot hold the token, cannot receive it, and cannot
 * place an offer for it — the ledger rejects the operation. Compliance stops
 * being something the frontend has to remember to check.
 *
 * Revocation is symmetric: clearing the authorized flag freezes the balance and
 * the network pulls that account's open offers automatically.
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
} from '@stellar/stellar-sdk';
import { getTestnetConfig } from '../admin/testnet';

/** Stellar amounts carry at most 7 decimals. */
const STROOP_DECIMALS = 7;
/** BASE_FEE is the floor, not a good default under load. */
const FEE = String(Number(BASE_FEE) * 100);
const TX_TIMEOUT_SECONDS = 180;

export interface OrderBookLevel {
  price: number;
  amount: number;
  /** Cumulative amount from the top of the book down to this level. */
  total: number;
}

export interface OrderBook {
  /** Offers to buy the security, best (highest) price first. */
  bids: OrderBookLevel[];
  /** Offers to sell the security, best (lowest) price first. */
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
  limit: number;
}

function server() {
  return new Horizon.Server(getTestnetConfig().horizonUrl);
}

function networkPassphrase() {
  return getTestnetConfig().networkPassphrase;
}

/** Formats a number as a Stellar amount string, truncating past 7 decimals. */
export function toStellarAmount(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error('Monto inválido');
  }
  return value.toFixed(STROOP_DECIMALS);
}

/**
 * Builds the classic asset for a tokenized security.
 *
 * Asset codes of 1-4 characters use `credit_alphanum4` and 5-12 use
 * `credit_alphanum12`; the SDK picks the right one from the length.
 */
export function securityAsset(code: string, issuer: string): Asset {
  const trimmed = code.trim().toUpperCase();
  if (trimmed.length < 1 || trimmed.length > 12) {
    throw new Error(`Código de activo inválido: "${code}" (1 a 12 caracteres)`);
  }
  return new Asset(trimmed, issuer);
}

function issuerKeypair(): Keypair {
  const secret = process.env.STELLAR_ISSUER_SECRET;
  if (!secret) {
    throw new Error(
      'Falta STELLAR_ISSUER_SECRET. La clave del emisor se inyecta por entorno y nunca se guarda en el repo.',
    );
  }
  return Keypair.fromSecret(secret);
}

async function buildAndSubmit(
  sourcePublicKey: string,
  addOps: (b: TransactionBuilder) => TransactionBuilder,
  signers: Keypair[],
) {
  const srv = server();
  const account = await srv.loadAccount(sourcePublicKey);
  const builder = new TransactionBuilder(account, {
    fee: FEE,
    networkPassphrase: networkPassphrase(),
  });
  const tx = addOps(builder).setTimeout(TX_TIMEOUT_SECONDS).build();
  signers.forEach((s) => tx.sign(s));
  try {
    return await srv.submitTransaction(tx);
  } catch (err: any) {
    throw new Error(describeHorizonError(err));
  }
}

/** Turns Horizon's nested result codes into something an operator can act on. */
export function describeHorizonError(err: any): string {
  const extras = err?.response?.data?.extras;
  const opCodes: string[] = extras?.result_codes?.operations ?? [];
  const txCode: string | undefined = extras?.result_codes?.transaction;

  if (opCodes.includes('op_not_authorized')) {
    return 'La cuenta no está autorizada para operar este activo. Aprobá el KYC para habilitar la trustline.';
  }
  if (opCodes.includes('op_no_trust')) {
    return 'La cuenta no tiene trustline con el token. Tiene que aprobarlo antes de operar.';
  }
  if (opCodes.includes('op_underfunded')) {
    return 'Saldo insuficiente para cubrir la orden.';
  }
  if (opCodes.includes('op_line_full')) {
    return 'La orden excede el límite de la trustline del comprador.';
  }
  if (opCodes.includes('op_cross_self')) {
    return 'La orden cruzaría contra una orden propia.';
  }
  if (txCode === 'tx_insufficient_balance') {
    return 'La cuenta no tiene XLM suficiente para la reserva y la comisión.';
  }
  if (opCodes.length || txCode) {
    return `Stellar rechazó la operación (${txCode ?? ''} ${opCodes.join(', ')}).`.trim();
  }
  return err?.message || 'Error desconocido al enviar la transacción a Stellar.';
}

/* ------------------------------------------------------------------ *
 * Issuer configuration — the compliance perimeter
 * ------------------------------------------------------------------ */

/**
 * Turns on the flags that make the asset a regulated security.
 *
 * `AUTH_REQUIRED` is the KYC gate itself: from here on, a trustline does
 * nothing until `authorizeHolder` approves it. `AUTH_REVOCABLE` is what lets
 * compliance freeze a holder later. Clawback is optional and deliberately
 * opt-in, because it is a strong power that some investors will refuse.
 *
 * Run this **before** distributing any token. `AUTH_REQUIRED` does not
 * retroactively deauthorize trustlines that already exist.
 */
export async function configureIssuerForRegulatedAsset(opts?: { clawback?: boolean }) {
  const issuer = issuerKeypair();
  let flags = AuthRequiredFlag | AuthRevocableFlag;
  if (opts?.clawback) flags |= AuthClawbackEnabledFlag;

  return buildAndSubmit(
    issuer.publicKey(),
    (b) => b.addOperation(Operation.setOptions({ setFlags: flags as any })),
    [issuer],
  );
}

/**
 * Approves a holder, which is the on-chain half of a KYC approval.
 *
 * Call this the moment compliance approves the investor. Until it runs, the
 * investor's trustline exists but is inert.
 */
export async function authorizeHolder(asset: Asset, trustor: string) {
  const issuer = issuerKeypair();
  return buildAndSubmit(
    issuer.publicKey(),
    (b) =>
      b.addOperation(
        Operation.setTrustLineFlags({
          trustor,
          asset,
          flags: { authorized: true },
        }),
      ),
    [issuer],
  );
}

/**
 * Withdraws a holder's authorization.
 *
 * Full revocation freezes the balance and makes the network delete that
 * account's open offers for the asset. `allowUnwind` instead grants
 * `authorizedToMaintainLiabilities`, which lets the holder close out existing
 * offers but not open new ones — the graceful path for a lapsed KYC that is
 * being renewed, rather than a sanctions hit.
 */
export async function deauthorizeHolder(
  asset: Asset,
  trustor: string,
  opts?: { allowUnwind?: boolean },
) {
  const issuer = issuerKeypair();
  const flags = opts?.allowUnwind
    ? { authorized: false, authorizedToMaintainLiabilities: true }
    : { authorized: false, authorizedToMaintainLiabilities: false };

  return buildAndSubmit(
    issuer.publicKey(),
    (b) => b.addOperation(Operation.setTrustLineFlags({ trustor, asset, flags })),
    [issuer],
  );
}

/** Reads whether a holder is cleared to trade, straight from the ledger. */
export async function getTrustlineState(
  accountId: string,
  asset: Asset,
): Promise<TrustlineState> {
  const empty: TrustlineState = {
    exists: false,
    authorized: false,
    maintainingLiabilitiesOnly: false,
    balance: 0,
    limit: 0,
  };
  try {
    const account = await server().loadAccount(accountId);
    const line = account.balances.find(
      (b: any) =>
        b.asset_type !== 'native' &&
        b.asset_type !== 'liquidity_pool_shares' &&
        b.asset_code === asset.getCode() &&
        b.asset_issuer === asset.getIssuer(),
    ) as any;
    if (!line) return empty;
    return {
      exists: true,
      authorized: Boolean(line.is_authorized),
      maintainingLiabilitiesOnly:
        !line.is_authorized && Boolean(line.is_authorized_to_maintain_liabilities),
      balance: Number(line.balance),
      limit: Number(line.limit),
    };
  } catch {
    return empty;
  }
}

/* ------------------------------------------------------------------ *
 * Order book
 * ------------------------------------------------------------------ */

/**
 * Reads the live order book for `security` priced in `counter`.
 *
 * Bids come back highest-first and asks lowest-first, which is the order the
 * UI renders them in, with a running cumulative total per level so the depth
 * column needs no client-side arithmetic.
 */
export async function getOrderBook(
  security: Asset,
  counter: Asset,
  limit = 20,
): Promise<OrderBook> {
  const raw = await server().orderbook(security, counter).limit(limit).call();

  const level = (rows: Array<{ price: string; amount: string }>): OrderBookLevel[] => {
    let running = 0;
    return rows.map((r) => {
      const amount = Number(r.amount);
      running += amount;
      return { price: Number(r.price), amount, total: running };
    });
  };

  const bids = level(raw.bids as any);
  const asks = level(raw.asks as any);
  const bestBid = bids[0]?.price ?? null;
  const bestAsk = asks[0]?.price ?? null;

  return {
    bids,
    asks,
    spread: bestBid !== null && bestAsk !== null ? bestAsk - bestBid : null,
    midPrice: bestBid !== null && bestAsk !== null ? (bestAsk + bestBid) / 2 : null,
    base: { code: security.getCode(), issuer: security.getIssuer() },
    counter: { code: counter.getCode(), issuer: counter.getIssuer() },
    source: 'sdex',
  };
}

/**
 * Recent executed trades for the pair, newest first.
 *
 * Horizon reports each trade from the perspective of whichever asset it
 * considers the base, so the price is inverted whenever our security landed on
 * the counter side. Normalizing here keeps every price in the API denominated
 * in the counter asset, matching the order book and the order form.
 */
export async function getRecentTrades(security: Asset, counter: Asset, limit = 20) {
  const page = await server()
    .trades()
    .forAssetPair(security, counter)
    .order('desc')
    .limit(limit)
    .call();

  return page.records.map((t: any) => {
    const securityIsBase =
      t.base_asset_code === security.getCode() && t.base_asset_issuer === security.getIssuer();
    const n = Number(t.price?.n ?? 0);
    const d = Number(t.price?.d ?? 1);
    const raw = d === 0 ? 0 : n / d;
    return {
      id: String(t.id),
      price: securityIsBase ? raw : raw === 0 ? 0 : 1 / raw,
      amount: Number(securityIsBase ? t.base_amount : t.counter_amount),
      createdAt: t.ledger_close_time,
    };
  });
}

/** Open offers for one account, so a trader can see and cancel their own. */
export async function getAccountOffers(accountId: string) {
  const page = await server().offers().forAccount(accountId).limit(50).call();
  return page.records.map((o: any) => ({
    id: String(o.id),
    selling: o.selling,
    buying: o.buying,
    amount: Number(o.amount),
    price: Number(o.price),
    lastModified: o.last_modified_time,
  }));
}

/* ------------------------------------------------------------------ *
 * Placing orders
 * ------------------------------------------------------------------ */

export interface OfferRequest {
  /** The investor's own account. They keep custody and sign themselves. */
  accountId: string;
  security: Asset;
  counter: Asset;
  /** Quantity of the security, in whole tokens. */
  quantity: number;
  /** Price of one security token, denominated in the counter asset. */
  price: number;
  /**
   * Passing an existing offer id edits it; `0` creates a new one. Setting
   * quantity to 0 on an existing id cancels it.
   */
  offerId?: string;
}

/**
 * Builds an unsigned sell order for the investor to sign in their wallet.
 *
 * Returned as XDR rather than submitted: this is a security token, so the
 * investor holds their own keys and the backend never needs them.
 */
export async function buildSellOfferXdr(req: OfferRequest): Promise<string> {
  const account = await server().loadAccount(req.accountId);
  const tx = new TransactionBuilder(account, {
    fee: FEE,
    networkPassphrase: networkPassphrase(),
  })
    .addOperation(
      Operation.manageSellOffer({
        selling: req.security,
        buying: req.counter,
        amount: req.quantity === 0 ? '0' : toStellarAmount(req.quantity),
        price: String(req.price),
        offerId: req.offerId ?? '0',
      }),
    )
    .setTimeout(TX_TIMEOUT_SECONDS)
    .build();
  return tx.toXDR();
}

/**
 * Builds an unsigned buy order.
 *
 * `manageBuyOffer` fixes the quantity of the security acquired and lets the
 * counter amount float, which is what a buyer filling a specific number of
 * shares actually wants. In both directions `price` means counter per
 * security, so the UI can use one number.
 */
export async function buildBuyOfferXdr(req: OfferRequest): Promise<string> {
  const account = await server().loadAccount(req.accountId);
  const tx = new TransactionBuilder(account, {
    fee: FEE,
    networkPassphrase: networkPassphrase(),
  })
    .addOperation(
      Operation.manageBuyOffer({
        selling: req.counter,
        buying: req.security,
        buyAmount: req.quantity === 0 ? '0' : toStellarAmount(req.quantity),
        price: String(req.price),
        offerId: req.offerId ?? '0',
      }),
    )
    .setTimeout(TX_TIMEOUT_SECONDS)
    .build();
  return tx.toXDR();
}

/** Builds the trustline the investor needs before they can be authorized. */
export async function buildTrustlineXdr(
  accountId: string,
  asset: Asset,
  limit?: number,
): Promise<string> {
  const account = await server().loadAccount(accountId);
  const tx = new TransactionBuilder(account, {
    fee: FEE,
    networkPassphrase: networkPassphrase(),
  })
    .addOperation(
      Operation.changeTrust({
        asset,
        ...(limit !== undefined ? { limit: toStellarAmount(limit) } : {}),
      }),
    )
    .setTimeout(TX_TIMEOUT_SECONDS)
    .build();
  return tx.toXDR();
}

/** Submits a transaction the investor already signed in their wallet. */
export async function submitSignedXdr(xdr: string) {
  const srv = server();
  const tx = new Transaction(xdr, networkPassphrase());
  try {
    return await srv.submitTransaction(tx);
  } catch (err: any) {
    throw new Error(describeHorizonError(err));
  }
}

/**
 * Signs and submits on behalf of a custodial account.
 *
 * Only for wallets the platform provisioned itself. Investors who brought
 * their own wallet go through the XDR path above.
 */
export async function signAndSubmitXdr(xdr: string, secret: string) {
  const srv = server();
  const tx = new Transaction(xdr, networkPassphrase());
  tx.sign(Keypair.fromSecret(secret));
  try {
    return await srv.submitTransaction(tx);
  } catch (err: any) {
    throw new Error(describeHorizonError(err));
  }
}
