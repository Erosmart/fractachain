/**
 * Maps a Fractachain listing onto the Stellar DEX.
 *
 * The in-memory book in `orderbook.ts` stays as the sandbox fallback for demos
 * with no funded testnet accounts. Once a listing has a real issuer account,
 * this module takes over and the book the UI renders is the ledger's, not ours.
 */
import { Asset, Operation } from '@stellar/stellar-sdk';
import { getListing, Listing } from '../admin/listings';
import { getTestnetConfig } from '../admin/testnet';
import { custodialSigningKey, findAccountByPublicKey, getAccount, markTokensOnChain } from '../auth/accounts';
import { isStellarPublicKey } from '../auth/stellar_testnet';
import { syncHolderAuthorization } from '../stellar/compliance';
import { usdcIssuerPublicKey } from '../stellar/keys';
import {
  buildBuyOfferXdr,
  buildOfferOpsXdr,
  buildSellOfferXdr,
  buildTrustlineXdr,
  distributeTokens,
  getAccountOffers,
  getOrderBook,
  getPairOffers,
  getRecentTrades,
  getTrustlineState,
  getTrustlineStates,
  securityAsset,
  signAndSubmitXdr,
  type OrderBook,
} from '../stellar/sdex';

/**
 * The classic USDC the SDEX pairs quote against. Must resolve to the same
 * issuer the licitación escrow charges (platform issuer on testnet, Circle on
 * pubnet) — otherwise the book would trade a different asset than the one
 * investors paid with. `usdcIssuerPublicKey` covers env and deployments.json.
 *
 * This is deliberately the *classic* asset, not the Soroban SAC: SDEX trades
 * classic assets, and only classic assets have an order book.
 */
const USDC_CODE = process.env.STELLAR_USDC_CODE || 'USDC';

export function counterAsset(): Asset {
  const issuer = usdcIssuerPublicKey();
  if (!issuer) throw new Error('Falta el emisor USDC configurado (STELLAR_USDC_ISSUER_SECRET / deployments)');
  return new Asset(USDC_CODE, issuer);
}

/**
 * Circle's faucet USDC — what testnet books quoted against before the
 * platform issuer (GCASKV…) existed. Offers left on that pair are zombies:
 * unreachable by new orders and invisible to the book. Testnet-only concern,
 * so this returns null anywhere else (and when the platform issuer itself is
 * the legacy one, which would make the pair identical anyway).
 */
const LEGACY_USDC_ISSUER = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';

export function legacyCounterAsset(): Asset | null {
  const issuer = usdcIssuerPublicKey();
  if (!issuer || issuer === LEGACY_USDC_ISSUER) return null;
  if (!getTestnetConfig().networkPassphrase.includes('Test SDF')) return null;
  return new Asset(USDC_CODE, LEGACY_USDC_ISSUER);
}

export function listingAsset(listing: Listing): Asset {
  return securityAsset(listing.dossier.tokenTicker, listing.dossier.issuerPublicKey);
}

/** A listing can only trade on SDEX once it has a real issuing account. */
export function sdexAvailable(listing: Listing): boolean {
  return (
    isStellarPublicKey(listing.dossier.issuerPublicKey) &&
    Boolean(listing.dossier.tokenTicker)
  );
}

function requireSdexListing(listingId: string): Listing {
  const listing = getListing(listingId);
  if (!listing) throw new Error('Mercado no encontrado');
  if (!sdexAvailable(listing)) {
    throw new Error(
      'Este listing todavía no tiene cuenta emisora en Stellar, así que no cotiza en el DEX',
    );
  }
  return listing;
}

export interface SdexBookView extends OrderBook {
  listingId: string;
  tokenTicker: string;
  legalName: string;
  refPrice: number;
  lastPrice: number;
  trades: Awaited<ReturnType<typeof getRecentTrades>>;
  /** Open offers belonging to the caller, so they can cancel them. */
  myOffers: (Awaited<ReturnType<typeof getAccountOffers>>[number] & { legacy?: boolean })[];
  /** Open offers still stranded on the superseded counter asset (all owners). */
  legacyOffers: number;
  /** Whether the caller is cleared by the issuer to trade this security. */
  authorized: boolean;
  needsTrustline: boolean;
  tokenBalance: number;
  sandbox: false;
}

/**
 * Reads the live book plus everything the caller needs to act on it.
 *
 * `authorized` comes from the ledger rather than our database on purpose: the
 * trustline flag is what actually decides whether an order will be accepted,
 * so showing anything else would let the UI promise a trade the network will
 * reject.
 */
const inflightBooks = new Map<string, Promise<SdexBookView>>();

export async function getSdexBook(listingId: string, accountId?: string): Promise<SdexBookView> {
  const key = `${listingId}:${accountId || ''}`;
  const pending = inflightBooks.get(key);
  if (pending) return pending;
  const next = loadSdexBook(listingId, accountId).finally(() => inflightBooks.delete(key));
  inflightBooks.set(key, next);
  return next;
}

/**
 * Manual maintenance tool — not run automatically. Rebooks stranded
 * legacy-pair offers onto the canonical pair in one cancel+replace tx.
 * Only custodial accounts can be migrated (the platform holds their keys);
 * the book already displays legacy levels merged in, so nothing here is
 * required for visibility — this exists in case we ever want to clean up
 * the old pair rather than just quote it.
 */
export async function migrateLegacyPair(security: Asset, counter: Asset, legacy: Asset) {
  const offers = await getPairOffers(security, legacy);
  for (const offer of offers) {
    const account = findAccountByPublicKey(offer.seller);
    if (!account?.publicKey || account.custodyMode !== 'CUSTODIAL') continue;
    try {
      await migrateLegacyOffer(account.id, offer, security, counter, legacy);
    } catch (err: any) {
      console.warn('[legacy-sdex] offer', offer.id, err?.message || err);
    }
  }
}

async function migrateLegacyOffer(
  accountId: string,
  offer: { id: string; side: 'BUY' | 'SELL'; amount: string; priceR: { n: number; d: number } },
  security: Asset,
  counter: Asset,
  legacy: Asset,
) {
  const account = getAccount(accountId);
  if (!account?.publicKey) return;
  const secret = custodialSigningKey(accountId);

  // The replacement bid spends the new USDC — make sure the wallet has the
  // trustline and a funded balance before placing it.
  const { fundTestnetUsdc } = await import('../stellar/usdc');
  await fundTestnetUsdc(account.publicKey, { walletSecret: secret });

  const stroops = (decimal: string) => BigInt(Math.round(Number(decimal) * 1e7));
  const toAmount = (s: bigint) => `${s / 10_000_000n}.${String(s % 10_000_000n).padStart(7, '0')}`;
  const { n, d } = offer.priceR;

  let ops;
  if (offer.side === 'SELL') {
    // Asks already price counter-per-security — reuse the fraction verbatim.
    ops = [
      Operation.manageSellOffer({ selling: security, buying: legacy, amount: '0', price: { n, d }, offerId: offer.id }),
      Operation.manageSellOffer({ selling: security, buying: counter, amount: offer.amount, price: { n, d }, offerId: '0' }),
    ];
  } else {
    // The record stores buying-per-selling; manageBuyOffer wants the inverse
    // (counter per security) and a buyAmount denominated in the security.
    const buyStroops = (stroops(offer.amount) * BigInt(n)) / BigInt(d);
    if (buyStroops <= 0n) return;
    ops = [
      Operation.manageBuyOffer({ buying: security, selling: legacy, buyAmount: '0', price: { n: d, d: n }, offerId: offer.id }),
      Operation.manageBuyOffer({ buying: security, selling: counter, buyAmount: toAmount(buyStroops), price: { n: d, d: n }, offerId: '0' }),
    ];
  }
  const xdr = await buildOfferOpsXdr(account.publicKey, ops);
  await signAndSubmitXdr(xdr, secret);
}

async function loadSdexBook(listingId: string, accountId?: string): Promise<SdexBookView> {
  const listing = requireSdexListing(listingId);
  const security = listingAsset(listing);
  const counter = counterAsset();
  const legacy = legacyCounterAsset();

  const [book, trades] = await Promise.all([
    getOrderBook(security, counter),
    getRecentTrades(security, counter, 100).catch(() => []),
  ]);

  // Orders resting on the old counter asset are still real orders: merge them
  // into the book flagged `legacy` so nothing disappears. New orders always
  // post to the canonical pair — prepareOrder only ever builds against
  // counterAsset(), so the legacy side can only shrink from here.
  let mergedBook = book;
  let mergedTrades = trades;
  let legacyOffers = 0;
  if (legacy) {
    const [legacyBook, legacyTrades] = await Promise.all([
      getOrderBook(security, legacy).catch(() => null),
      getRecentTrades(security, legacy, 100).catch(() => []),
    ]);
    if (legacyBook) {
      const bids = [...book.bids, ...legacyBook.bids.map((b) => ({ ...b, legacy: true }))]
        .sort((a, b) => b.price - a.price);
      const asks = [...book.asks, ...legacyBook.asks.map((a) => ({ ...a, legacy: true }))]
        .sort((a, b) => a.price - b.price);
      const bestBid = bids[0]?.price ?? null;
      const bestAsk = asks[0]?.price ?? null;
      mergedBook = {
        ...book,
        bids,
        asks,
        spread: bestBid != null && bestAsk != null ? bestAsk - bestBid : null,
        midPrice: bestBid != null && bestAsk != null ? (bestAsk + bestBid) / 2 : bestBid ?? bestAsk,
      };
      mergedTrades = [...trades, ...legacyTrades.map((t: any) => ({ ...t, legacy: true }))]
        .sort((a: any, b: any) => String(b.createdAt).localeCompare(String(a.createdAt)))
        .slice(0, 150);
      legacyOffers = legacyBook.bids.length + legacyBook.asks.length;
    }
  }

  let myOffers: SdexBookView['myOffers'] = [];
  let authorized = false;
  let needsTrustline = true;
  let tokenBalance = 0;

  const account = accountId ? getAccount(accountId) : undefined;
  if (account?.publicKey) {
    const [offers, line] = await Promise.all([
      getAccountOffers(account.publicKey).catch(() => []),
      getTrustlineState(account.publicKey, security),
    ]);
    // Horizon returns every offer on the account; keep only this market's and
    // flag the ones still quoting the superseded counter asset — the holder
    // sees them marked legacy and can cancel them like any other order.
    const legacyIssuer = legacy?.getIssuer();
    myOffers = offers
      .filter(
        (o: any) =>
          o.selling?.asset_code === security.getCode() ||
          o.buying?.asset_code === security.getCode(),
      )
      .map((o: any) => ({
        ...o,
        legacy: Boolean(
          legacyIssuer &&
            (o.selling?.asset_issuer === legacyIssuer || o.buying?.asset_issuer === legacyIssuer),
        ),
      }));
    authorized = line.authorized;
    needsTrustline = !line.exists;
    tokenBalance = line.balance;
  }

  return {
    ...mergedBook,
    listingId,
    tokenTicker: listing.dossier.tokenTicker,
    legalName: listing.dossier.legalName,
    refPrice: listing.dossier.pricePerShareUsdc,
    // Falls back to the primary-offering price until the pair has traded.
    lastPrice: mergedTrades[0]?.price ?? mergedBook.midPrice ?? listing.dossier.pricePerShareUsdc,
    trades: mergedTrades,
    myOffers,
    legacyOffers,
    authorized,
    needsTrustline,
    tokenBalance,
    sandbox: false,
  };
}

export type Side = 'BUY' | 'SELL';

/**
 * Prepares an order for the investor to sign.
 *
 * Nothing is submitted here. The investor holds their own keys, signs in their
 * wallet, and the signed XDR comes back through `submitSignedXdr`. The backend
 * never has the ability to move their securities.
 */
export async function prepareOrder(params: {
  listingId: string;
  accountId: string;
  side: Side;
  price: number;
  quantity: number;
  offerId?: string;
}): Promise<{ xdr: string; summary: Record<string, unknown> }> {
  const listing = requireSdexListing(params.listingId);
  const account = getAccount(params.accountId);
  if (!account?.publicKey) throw new Error('La cuenta no tiene wallet de Stellar asociada');
  if (account.kycStatus !== 'APPROVED') {
    throw new Error('Solo inversores con KYC aprobado pueden operar');
  }
  if (params.price <= 0 || params.quantity <= 0) {
    throw new Error('Precio o cantidad inválidos');
  }

  const security = listingAsset(listing);
  const counter = counterAsset();

  // Fail here with a readable reason rather than letting Horizon reject the
  // signed transaction with op_not_authorized after the user has signed it.
  // One loadAccount covers both the security and the USDC counter.
  const [line, counterLine] = await getTrustlineStates(account.publicKey, [security, counter]);
  if (!line.exists) {
    throw new Error(`Primero aprobá el token ${listing.dossier.tokenTicker} (trustline)`);
  }
  if (!line.authorized) {
    throw new Error(
      'Tu cuenta no está autorizada por el emisor para operar este activo. Necesitás el KYC aprobado.',
    );
  }

  // Selling also needs a trustline on the counter asset to receive it; buying
  // needs one to spend it. Open it inside the offer tx so a single signature
  // covers both ops — otherwise Horizon rejects with op_buy_no_trust.

  const req = {
    accountId: account.publicKey,
    security,
    counter,
    quantity: params.quantity,
    price: params.price,
    offerId: params.offerId,
    openCounterTrustline: !counterLine.exists,
  };

  const xdr =
    params.side === 'BUY' ? await buildBuyOfferXdr(req) : await buildSellOfferXdr(req);

  return {
    xdr,
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

/**
 * Builds, signs and submits in one call for a platform-custodied wallet.
 *
 * Self-custody accounts deliberately cannot use this: `custodialSigningKey`
 * throws for them, and they go through `prepareOrder` plus a wallet signature
 * instead. Same code path builds the transaction either way, so the two modes
 * cannot drift apart.
 */
export async function placeCustodialOrder(params: {
  listingId: string;
  accountId: string;
  side: Side;
  price: number;
  quantity: number;
  offerId?: string;
}) {
  const { xdr, summary } = await prepareOrder(params);
  const secret = custodialSigningKey(params.accountId);
  const result = await signAndSubmitXdr(xdr, secret);
  return { summary, hash: (result as any).hash, book: await getSdexBook(params.listingId, params.accountId) };
}

/**
 * Cancelling is an order for zero at the same price, keyed by offer id.
 * `legacy` targets the superseded counter-asset pair — Horizon matches an
 * offer id against the exact pair it was posted on, so a stranded order can
 * only be cancelled with the legacy asset in the op.
 */
export async function prepareCancel(params: {
  listingId: string;
  accountId: string;
  side: Side;
  offerId: string;
  price: number;
  legacy?: boolean;
}): Promise<{ xdr: string }> {
  const listing = requireSdexListing(params.listingId);
  const account = getAccount(params.accountId);
  if (!account?.publicKey) throw new Error('La cuenta no tiene wallet de Stellar asociada');

  const counter = (params.legacy && legacyCounterAsset()) || counterAsset();
  const counterLine = await getTrustlineState(account.publicKey, counter);
  const req = {
    accountId: account.publicKey,
    security: listingAsset(listing),
    counter,
    quantity: 0,
    price: params.price,
    offerId: params.offerId,
    openCounterTrustline: !counterLine.exists,
  };
  const xdr =
    params.side === 'BUY' ? await buildBuyOfferXdr(req) : await buildSellOfferXdr(req);
  return { xdr };
}

/** Custodial counterpart of `prepareCancel`: build, sign and submit. */
export async function cancelCustodialOrder(params: {
  listingId: string;
  accountId: string;
  side: Side;
  offerId: string;
  price: number;
  legacy?: boolean;
}) {
  const { xdr } = await prepareCancel(params);
  const secret = custodialSigningKey(params.accountId);
  const result = await signAndSubmitXdr(xdr, secret);
  return { hash: (result as any).hash as string };
}

/**
 * Prepares the trustline the investor signs to opt into holding the security.
 *
 * Creating it does not grant anything: with `AUTH_REQUIRED` the line stays
 * inert until compliance approves the investor and the issuer authorizes it.
 */
export async function prepareTrustline(params: {
  listingId: string;
  accountId: string;
  limit?: number;
}): Promise<{ xdr: string; tokenTicker: string }> {
  const listing = requireSdexListing(params.listingId);
  const account = getAccount(params.accountId);
  if (!account?.publicKey) throw new Error('La cuenta no tiene wallet de Stellar asociada');

  const xdr = await buildTrustlineXdr(
    account.publicKey,
    listingAsset(listing),
    params.limit,
  );
  return { xdr, tokenTicker: listing.dossier.tokenTicker };
}

/**
 * Custodial counterpart of `prepareTrustline`: build, sign, submit, then ask
 * the issuer to authorize the line if KYC is already approved.
 *
 * Creating the trustline is not a grant. `AUTH_REQUIRED` keeps it inert until
 * `syncHolderAuthorization` sets the flag, which is what actually lets the
 * account receive or trade the security on SDEX.
 */
export async function openCustodialTrustline(params: {
  listingId: string;
  accountId: string;
  limit?: number;
}) {
  const listing = requireSdexListing(params.listingId);
  const account = getAccount(params.accountId);
  if (!account?.publicKey) throw new Error('La cuenta no tiene wallet de Stellar asociada');
  if (account.kycStatus !== 'APPROVED') {
    throw new Error('Solo inversores con KYC aprobado pueden aprobar el token');
  }

  const line = await getTrustlineState(account.publicKey, listingAsset(listing));
  let hash: string | undefined;
  if (!line.exists) {
    const { xdr } = await prepareTrustline(params);
    const secret = custodialSigningKey(params.accountId);
    const result = await signAndSubmitXdr(xdr, secret);
    hash = (result as any).hash;
  }

  const compliance = await syncHolderAuthorization(account.publicKey, true);
  return {
    tokenTicker: listing.dossier.tokenTicker,
    hash,
    compliance,
    listingId: listing.id,
  };
}

/**
 * Pays the holder's claimed platform-ledger tokens into their real trustline.
 *
 * The sandbox claim only moves `tokensOwed → tokens` in our database; SDEX
 * sells need the units on-ledger. We track `tokensOnChain` per holding so a
 * retry after a failed submission never double-pays.
 */
export async function distributeClaimedTokens(params: { listingId: string; accountId: string }) {
  const listing = requireSdexListing(params.listingId);
  const account = getAccount(params.accountId);
  if (!account?.publicKey) throw new Error('La cuenta no tiene wallet de Stellar asociada');
  const holding = (account.holdings || []).find((h) => h.listingId === params.listingId);
  const pending = Math.max(0, (holding?.tokens || 0) - (holding?.tokensOnChain || 0));
  if (!holding || pending <= 0) {
    throw new Error('No hay tokens reclamados pendientes de envío on-chain');
  }

  const security = listingAsset(listing);
  if (account.custodyMode === 'CUSTODIAL') {
    // Creates the line when missing and asks the issuer to authorize it.
    await openCustodialTrustline({ listingId: listing.id, accountId: account.id });
  } else {
    const line = await getTrustlineState(account.publicKey, security);
    if (!line.exists) {
      throw new Error(
        `Primero aprobá el token ${listing.dossier.tokenTicker}: firmá la trustline desde el orderbook`,
      );
    }
    if (!line.authorized) {
      await syncHolderAuthorization(account.publicKey, true);
    }
  }

  const result = await distributeTokens(account.publicKey, security, pending);
  markTokensOnChain(account.id, listing.id, pending);
  return {
    hash: (result as any).hash as string,
    amount: pending,
    destination: account.publicKey,
    tokenTicker: listing.dossier.tokenTicker,
  };
}
