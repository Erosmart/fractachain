import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { PaymentKind } from './issuance';
import { addHolding, creditCash, debitCash, findAccountByPublicKey, getAccount, requireApprovedTrader } from '../auth/accounts';
import { getTestnetConfig } from './testnet';
import { StrKey } from '@stellar/stellar-sdk';
import { isStellarPublicKey } from '../auth/stellar_testnet';
import { loadTestnetDeployment } from '../stellar/deployment';
import { isLiveContractId } from '../stellar/soroban';

export type ListingStatus =
  | 'DRAFT'
  | 'DEPLOYED'
  | 'TOKENS_MINTED'
  | 'LISTED'
  | 'CLOSED_SUCCESS'
  | 'CLOSED_FAILED';

export interface CompanyDossier {
  legalName: string;
  tradeName: string;
  cuit: string;
  jurisdiction: string;
  sector: string;
  ticker: string;
  tokenTicker: string;
  isin: string;
  authorizedShares: number;
  sharesToTokenize: number;
  pricePerShareUsdc: number;
  cajaSubaccount: string;
  custodianCuit: string;
  cnvRecordId: string;
  bymaRequestId: string;
  legalTermsUri: string;
  estatutoHash: string;
  auditor: string;
  issuerPublicKey: string;
  /**
   * Wallet of the issuing company that receives the raise when the licitación
   * closes successfully. Mirrors the `Fiduciary` address in the licitación
   * contract, which is the address `withdraw_proceeds` actually pays.
   */
  proceedsWallet: string;
  paymentKind: PaymentKind;
  offeringSoftCapUsdc: number;
  offeringHardCapUsdc: number;
  offeringDays: number;
  tnaUsd: number;
  useOfProceeds: string;
  minInvestmentUsdc?: number;
}

export interface Listing {
  id: string;
  dossier: CompanyDossier;
  status: ListingStatus;
  stockContract: string;
  licitacionContract: string;
  factoryProductId: number | null;
  wasmStock: string;
  wasmLicitacion: string;
  tokensMinted: number;
  sharesCustodied: number;
  cvDepositHash: string;
  raisedUsdc: number;
  settlePolicy?: 'ON_MIN' | 'ON_DATE';
  settleAt?: string;
  closedAt?: string;
  listedAt?: string;
  deployedAt?: string;
  mintedAt?: string;
  createdAt: string;
  /** Stellar address that actually received the raise when the offering closed. */
  proceedsPaidTo?: string;
  proceedsPaidAt?: string;
  /** Hash of the on-chain `finalize()` (or refund recovery) transaction. */
  finalizeHash?: string;
  finalizeAt?: string;
}

const DATA = path.join(__dirname, '..', '..', 'data', 'listings.json');
let listings: Listing[] = [];

function load() {
  try {
    if (fs.existsSync(DATA)) {
      listings = JSON.parse(fs.readFileSync(DATA, 'utf8'));
    }
  } catch {
    listings = [];
  }
}

function save() {
  fs.mkdirSync(path.dirname(DATA), { recursive: true });
  fs.writeFileSync(DATA, JSON.stringify(listings, null, 2));
}

load();

function contractId(seed: string) {
  const h = crypto.createHash('sha256').update(seed).digest('hex').toUpperCase();
  return `C${h.slice(0, 55)}`;
}

function hexHash(seed: string) {
  return crypto.createHash('sha256').update(seed).digest('hex');
}

function requireDossier(d: CompanyDossier) {
  const missing: string[] = [];
  const fields: (keyof CompanyDossier)[] = [
    'legalName',
    'cuit',
    'ticker',
    'tokenTicker',
    'isin',
    'cajaSubaccount',
    'custodianCuit',
    'cnvRecordId',
    'legalTermsUri',
    'estatutoHash',
    'auditor',
    'proceedsWallet',
  ];
  for (const f of fields) {
    if (!String(d[f] || '').trim()) missing.push(f);
  }
  // The raise is paid out to this address on-chain, so a typo here sends the
  // whole offering somewhere unrecoverable. Validate the checksum, not just
  // that the field is non-empty.
  if (d.proceedsWallet && !isStellarPublicKey(d.proceedsWallet.trim())) {
    throw new Error('La wallet que recibe la licitación no es una dirección Stellar válida (debe empezar con G)');
  }
  if (
    d.proceedsWallet &&
    d.issuerPublicKey &&
    d.proceedsWallet.trim() === d.issuerPublicKey.trim()
  ) {
    throw new Error(
      'La wallet que cobra no puede ser la cuenta emisora: el emisor de un activo no puede mantener saldo propio del token',
    );
  }
  if (!d.sharesToTokenize || d.sharesToTokenize <= 0) missing.push('sharesToTokenize');
  if (!d.pricePerShareUsdc || d.pricePerShareUsdc <= 0) missing.push('pricePerShareUsdc');
  if (!d.offeringHardCapUsdc || d.offeringHardCapUsdc <= 0) missing.push('offeringHardCapUsdc');
  if (d.offeringSoftCapUsdc > d.offeringHardCapUsdc) {
    throw new Error('Soft cap no puede ser mayor que hard cap');
  }
  if (missing.length) {
    throw new Error('Falta información para salir a la bolsa: ' + missing.join(', '));
  }
  const cuit = d.cuit.replace(/[^\d]/g, '');
  if (cuit.length < 10) throw new Error('CUIT inválido');
}

export function listListings() {
  listings.forEach(applyDueClose);
  return [...listings].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export function getListing(id: string) {
  const listing = listings.find((l) => l.id === id);
  if (listing) applyDueClose(listing);
  return listing;
}

export function createListing(dossier: CompanyDossier): Listing {
  requireDossier(dossier);
  const ticker = dossier.ticker.trim().toUpperCase();
  if (listings.some((l) => l.dossier.ticker === ticker)) {
    throw new Error(`Ya existe un listing para ${ticker}`);
  }
  const chain = loadTestnetDeployment();
  const issuer =
    dossier.issuerPublicKey.trim() ||
    chain?.issuer ||
    '';
  const listing: Listing = {
    id: `IPO-${ticker}-${Date.now().toString(36)}`,
    dossier: {
      ...dossier,
      ticker,
      tokenTicker: dossier.tokenTicker.trim().toUpperCase(),
      issuerPublicKey: issuer,
      proceedsWallet: dossier.proceedsWallet.trim().toUpperCase(),
      paymentKind: dossier.paymentKind || 'USDC',
      jurisdiction: dossier.jurisdiction || 'Argentina',
      minInvestmentUsdc: dossier.minInvestmentUsdc && dossier.minInvestmentUsdc > 0 ? dossier.minInvestmentUsdc : 15000,
      offeringSoftCapUsdc: dossier.offeringSoftCapUsdc > 0 ? dossier.offeringSoftCapUsdc : 15000,
    },
    status: 'DRAFT',
    stockContract: '',
    licitacionContract: '',
    factoryProductId: null,
    wasmStock: 'stock_vault.wasm',
    wasmLicitacion: 'fractachain_licitacion.wasm',
    tokensMinted: 0,
    sharesCustodied: 0,
    cvDepositHash: '',
    raisedUsdc: 0,
    createdAt: new Date().toISOString(),
  };
  listings.unshift(listing);
  save();
  return listing;
}

export function deployListing(id: string): Listing {
  const listing = getListing(id);
  if (!listing) throw new Error('Listing no encontrado');
  requireDossier(listing.dossier);
  if (listing.status !== 'DRAFT') throw new Error('Ya está deployado');
  const chain = loadTestnetDeployment();
  listing.stockContract = chain?.stockVault || contractId(`${listing.id}:stock`);
  listing.licitacionContract = chain?.licitacion || listing.licitacionContract;
  listing.factoryProductId = listings.filter((l) => l.factoryProductId).length + 1;
  listing.deployedAt = new Date().toISOString();
  listing.status = 'DEPLOYED';
  listing.cvDepositHash = hexHash(`${listing.dossier.cajaSubaccount}:${listing.dossier.isin}`);
  if (chain?.issuer && !isStellarPublicKey(listing.dossier.issuerPublicKey)) {
    listing.dossier.issuerPublicKey = chain.issuer;
  }
  save();
  return listing;
}

export function mintListingTokens(id: string, amount: number, cvDepositHash?: string): Listing {
  const listing = getListing(id);
  if (!listing) throw new Error('Listing no encontrado');
  if (listing.status === 'DRAFT') throw new Error('Primero deployá el contrato');
  if (amount <= 0) throw new Error('Monto inválido');
  const next = listing.tokensMinted + amount;
  if (next > listing.dossier.sharesToTokenize) {
    throw new Error('No se puede mintear más que las acciones a tokenizar');
  }
  listing.tokensMinted = next;
  listing.sharesCustodied = next;
  if (cvDepositHash) listing.cvDepositHash = cvDepositHash;
  listing.mintedAt = new Date().toISOString();
  listing.status = 'TOKENS_MINTED';
  save();
  return listing;
}

export function openLicitacion(id: string, opts?: { settlePolicy?: 'ON_MIN' | 'ON_DATE'; settleAt?: string }): Listing {
  const listing = listings.find((l) => l.id === id);
  if (!listing) throw new Error('Listing no encontrado');
  if (listing.tokensMinted <= 0) throw new Error('Primero minteá los tokens respaldados 1:1');
  if (listing.status === 'LISTED') throw new Error('Ya está en licitación');
  if (!isStellarPublicKey(listing.dossier.proceedsWallet)) {
    throw new Error('Configurá la wallet de cobro de la empresa antes de abrir la licitación');
  }
  const chain = loadTestnetDeployment();
  listing.licitacionContract = chain?.licitacion || contractId(`${listing.id}:licitacion`);
  listing.status = 'LISTED';
  listing.listedAt = new Date().toISOString();
  applySettleChoice(listing, opts);
  save();
  return listing;
}

/**
 * Repoints the wallet that will receive the raise.
 *
 * Mirrors `set_fiduciary` in the licitación contract, including its guard:
 * once money is in, the payout address is frozen. Changing it afterwards would
 * let the platform redirect funds investors already committed.
 */
export function setListingProceedsWallet(id: string, wallet: string): Listing {
  const listing = listings.find((l) => l.id === id);
  if (!listing) throw new Error('Listing no encontrado');
  const next = String(wallet || '').trim().toUpperCase();
  if (!isStellarPublicKey(next)) {
    throw new Error('La wallet que recibe la licitación no es una dirección Stellar válida (debe empezar con G)');
  }
  if (next === listing.dossier.issuerPublicKey?.trim().toUpperCase()) {
    throw new Error('La wallet que cobra no puede ser la cuenta emisora del token');
  }
  if (listing.raisedUsdc > 0) {
    throw new Error('Ya hay inversores que aportaron: la wallet de cobro no se puede cambiar');
  }
  listing.dossier.proceedsWallet = next;
  save();
  return listing;
}

export function setListingSettle(id: string, opts?: { settlePolicy?: 'ON_MIN' | 'ON_DATE'; settleAt?: string }): Listing {
  const listing = listings.find((l) => l.id === id);
  if (!listing) throw new Error('Listing no encontrado');
  if (listing.status !== 'LISTED') throw new Error('La licitación no está abierta');
  applySettleChoice(listing, opts);
  save();
  applyDueClose(listing);
  return listing;
}

function applySettleChoice(listing: Listing, opts?: { settlePolicy?: 'ON_MIN' | 'ON_DATE'; settleAt?: string }) {
  const cfg = getTestnetConfig();
  const policy = opts?.settlePolicy || cfg.settlePolicy || 'ON_MIN';
  listing.settlePolicy = policy === 'ON_DATE' ? 'ON_DATE' : 'ON_MIN';
  const at = opts?.settleAt || cfg.settleAt;
  if (listing.settlePolicy === 'ON_DATE') {
    if (!at) throw new Error('Indicá la fecha hasta la que esperás para repartir tokens');
    listing.settleAt = new Date(at).toISOString();
  } else {
    listing.settleAt = undefined;
  }
}

export function validationPack(listing: Listing) {
  const d = listing.dossier;
  const backing =
    listing.tokensMinted === 0
      ? 'sin mint'
      : listing.sharesCustodied === listing.tokensMinted
        ? '1:1 (100%)'
        : `${listing.sharesCustodied}:${listing.tokensMinted}`;
  return {
    listingId: listing.id,
    status: listing.status,
    token: {
      ticker: d.tokenTicker,
      underlying: d.ticker,
      isin: d.isin,
      pricePerShareUsdc: d.pricePerShareUsdc,
      paymentKind: d.paymentKind,
      tokensMinted: listing.tokensMinted,
      sharesCustodied: listing.sharesCustodied,
      backing,
    },
    company: {
      legalName: d.legalName,
      tradeName: d.tradeName,
      cuit: d.cuit,
      jurisdiction: d.jurisdiction,
      sector: d.sector,
      authorizedShares: d.authorizedShares,
      sharesToTokenize: d.sharesToTokenize,
    },
    custody: {
      cajaSubaccount: d.cajaSubaccount,
      custodianCuit: d.custodianCuit,
      cvDepositHash: listing.cvDepositHash,
      auditor: d.auditor,
    },
    regulator: {
      cnvRecordId: d.cnvRecordId,
      bymaRequestId: d.bymaRequestId,
      legalTermsUri: d.legalTermsUri,
      estatutoHash: d.estatutoHash,
    },
    payout: {
      proceedsWallet: d.proceedsWallet,
      proceedsPaidTo: listing.proceedsPaidTo || null,
      proceedsPaidAt: listing.proceedsPaidAt || null,
      issuerPublicKey: d.issuerPublicKey,
      // Locked as soon as the first investor pays in: from that point the
      // destination is part of the deal they agreed to.
      editable: listing.raisedUsdc === 0,
    },
    contracts: {
      stockVault: listing.stockContract,
      licitacion: listing.licitacionContract,
      factoryProductId: listing.factoryProductId,
      wasmStock: listing.wasmStock,
      wasmLicitacion: listing.wasmLicitacion,
    },
    offering: {
      softCapUsdc: d.offeringSoftCapUsdc,
      hardCapUsdc: d.offeringHardCapUsdc,
      raisedUsdc: listing.raisedUsdc,
      days: d.offeringDays,
      tnaUsd: d.tnaUsd,
      useOfProceeds: d.useOfProceeds,
      deadline: listing.settleAt
        || (listing.listedAt
          ? new Date(new Date(listing.listedAt).getTime() + d.offeringDays * 86400000).toISOString()
          : null),
      settlePolicy: listing.settlePolicy || 'ON_MIN',
      settleAt: listing.settleAt || null,
    },
    checks: [
      { key: 'cuit', ok: d.cuit.replace(/[^\d]/g, '').length >= 10, label: 'CUIT emisor' },
      { key: 'isin', ok: Boolean(d.isin), label: 'ISIN' },
      { key: 'cnv', ok: Boolean(d.cnvRecordId), label: 'Expediente CNV' },
      { key: 'caja', ok: Boolean(d.cajaSubaccount), label: 'Subcuenta Caja de Valores' },
      { key: 'deploy', ok: Boolean(listing.stockContract), label: 'Contrato stock vault deployado' },
      { key: 'mint', ok: listing.tokensMinted > 0, label: 'Tokens 1:1 minteados' },
      { key: 'por', ok: listing.tokensMinted === listing.sharesCustodied && listing.tokensMinted > 0, label: 'Proof of reserve 1:1' },
      { key: 'payout', ok: isStellarPublicKey(d.proceedsWallet), label: 'Wallet de cobro de la empresa' },
      { key: 'paid', ok: Boolean(listing.proceedsPaidAt) || listing.status !== 'CLOSED_SUCCESS', label: 'Fondos acreditados a la empresa' },
      { key: 'licitacion', ok: listing.status === 'LISTED', label: 'Licitación abierta' },
    ],
  };
}

function poolStatus(listing: Listing): 'OPEN' | 'SUCCESSFUL' | 'SETTLED' | 'FAILED' {
  if (listing.status === 'LISTED') return 'OPEN';
  if (listing.status === 'CLOSED_SUCCESS') return 'SUCCESSFUL';
  if (listing.status === 'CLOSED_FAILED') return 'FAILED';
  return 'SETTLED';
}

export function listedPools() {
  listings.forEach(applyDueClose);
  return listings
    .filter((l) => l.status === 'LISTED' || (isOnChainListing(l) && (l.status === 'CLOSED_SUCCESS' || l.status === 'CLOSED_FAILED')))
    .map((l) => {
      const d = l.dossier;
      const deadline = l.settleAt
        ? new Date(l.settleAt)
        : l.listedAt
          ? new Date(new Date(l.listedAt).getTime() + d.offeringDays * 86400000)
          : new Date();
      const daysRemaining = Math.max(0, Math.ceil((deadline.getTime() - Date.now()) / 86400000));
      return {
        id: l.id,
        title: `Oferta primaria ${d.tokenTicker} · ${d.legalName}`,
        producerName: `${d.legalName} (CUIT ${d.cuit})`,
        location: d.jurisdiction,
        targetAmount: d.offeringHardCapUsdc,
        raisedAmount: l.raisedUsdc,
        softCap: d.offeringSoftCapUsdc,
        hardCap: d.offeringHardCapUsdc,
        tna: d.tnaUsd,
        durationMonths: Math.max(1, Math.round(d.offeringDays / 30)),
        daysRemaining,
        commodityType: d.sector,
        riskScore: 'AA+',
        isSoftCapReached: l.raisedUsdc >= d.offeringSoftCapUsdc,
        minInvestment: d.minInvestmentUsdc || d.pricePerShareUsdc,
        status: poolStatus(l),
        tokenTicker: d.tokenTicker,
        ticker: d.ticker,
        isin: d.isin,
        paymentKind: d.paymentKind || 'USDC',
        finalizeHash: l.finalizeHash || null,
        validation: validationPack(l),
      };
    });
}

export function maybeCloseIfMinReached(id: string) {
  const listing = listings.find((l) => l.id === id);
  if (listing) applyDueClose(listing);
  return listing;
}

function applyDueClose(listing: Listing) {
  if (listing.status !== 'LISTED') return;
  // The live Soroban contract only finalizes on hard cap or deadline.
  if (isOnChainListing(listing)) return;
  const min = listing.dossier.offeringSoftCapUsdc || listing.dossier.minInvestmentUsdc || 0;
  const policy = listing.settlePolicy || 'ON_MIN';
  if (policy === 'ON_MIN' && min > 0 && listing.raisedUsdc >= min) {
    listing.status = 'CLOSED_SUCCESS';
    listing.closedAt = new Date().toISOString();
    payListingProceeds(listing);
    save();
    return;
  }
  if (policy === 'ON_DATE' && listing.settleAt && Date.now() >= new Date(listing.settleAt).getTime()) {
    listing.status = min > 0 && listing.raisedUsdc >= min ? 'CLOSED_SUCCESS' : 'CLOSED_FAILED';
    listing.closedAt = new Date().toISOString();
    if (listing.status === 'CLOSED_SUCCESS') payListingProceeds(listing);
    save();
  }
}

/**
 * Sends the raise to the company's wallet the moment the offering closes.
 *
 * Mirrors `finalize` on the licitación contract, which pays `Fiduciary`
 * automatically. If that wallet belongs to a platform account we credit the
 * sandbox cash too, so the demo UI shows the money arriving without waiting
 * for a Horizon round-trip.
 */
function payListingProceeds(listing: Listing) {
  if (listing.proceedsPaidAt) return;
  if (listing.status !== 'CLOSED_SUCCESS') return;
  const wallet = listing.dossier.proceedsWallet?.trim().toUpperCase();
  if (!isStellarPublicKey(wallet)) {
    return;
  }
  listing.proceedsPaidTo = wallet;
  listing.proceedsPaidAt = new Date().toISOString();
  // On-chain XLM already moved to the fiduciary in `finalize()`. Crediting
  // sandbox USDC here would invent a second, fake payout.
  if (isOnChainListing(listing)) return;
  const company = findAccountByPublicKey(wallet);
  if (company && listing.raisedUsdc > 0) {
    creditCash(company.id, listing.raisedUsdc);
  }
}

export function isOnChainListing(listing: Listing): boolean {
  return isLiveContractId(listing.licitacionContract) && listing.dossier.paymentKind === 'XLM';
}

export function bindLicitacionForDemo(
  id: string,
  contractId: string,
  opts?: { factoryProductId?: number | null },
): Listing {
  const listing = listings.find((l) => l.id === id);
  if (!listing) throw new Error('Listing no encontrado');
  if (!StrKey.isValidContract(contractId)) {
    throw new Error(`Contract id inválido: ${contractId}`);
  }
  listing.licitacionContract = contractId;
  listing.dossier.paymentKind = 'XLM';
  listing.dossier.pricePerShareUsdc = 10;
  listing.dossier.minInvestmentUsdc = 100;
  listing.dossier.offeringSoftCapUsdc = 100;
  listing.dossier.offeringHardCapUsdc = 100;
  listing.raisedUsdc = 0;
  listing.status = 'LISTED';
  listing.closedAt = undefined;
  listing.proceedsPaidAt = undefined;
  listing.proceedsPaidTo = undefined;
  if (opts?.factoryProductId != null) listing.factoryProductId = opts.factoryProductId;
  save();
  return listing;
}

export function recordOnChainContribution(
  id: string,
  accountId: string,
  input: { amount: number; tokens: number; raised: number },
): Listing {
  const listing = getListing(id);
  if (!listing) throw new Error('Listing no encontrado');
  const units = listing.dossier.pricePerShareUsdc > 0
    ? input.amount / listing.dossier.pricePerShareUsdc
    : input.tokens;
  addHolding(accountId, {
    listingId: listing.id,
    tokenTicker: listing.dossier.tokenTicker,
    usdcAmount: input.amount,
    tokens: 0,
    tokensOwed: units,
  });
  listing.raisedUsdc = input.raised;
  save();
  return getListing(id)!;
}

export function markListingClosed(
  id: string,
  status: 'CLOSED_SUCCESS' | 'CLOSED_FAILED',
  raised?: number,
  extra?: { finalizeHash?: string | null; proceedsPaidTo?: string | null },
): Listing {
  const listing = getListing(id);
  if (!listing) throw new Error('Listing no encontrado');
  listing.status = status;
  listing.closedAt = new Date().toISOString();
  if (typeof raised === 'number') listing.raisedUsdc = raised;
  if (extra?.finalizeHash) {
    listing.finalizeHash = extra.finalizeHash;
    listing.finalizeAt = new Date().toISOString();
  }
  if (status === 'CLOSED_SUCCESS') payListingProceeds(listing);
  if (extra?.proceedsPaidTo) listing.proceedsPaidTo = extra.proceedsPaidTo;
  save();
  return getListing(id)!;
}

export function recordFinalizeHash(id: string, hash: string | null | undefined): Listing {
  const listing = getListing(id);
  if (!listing) throw new Error('Listing no encontrado');
  if (hash) {
    listing.finalizeHash = hash;
    listing.finalizeAt = new Date().toISOString();
    save();
  }
  return listing;
}

export function closeListing(id: string) {
  const listing = getListing(id);
  if (!listing) throw new Error('Listing no encontrado');
  if (listing.status !== 'LISTED') throw new Error('La licitación no está abierta');
  if (isOnChainListing(listing)) {
    throw new Error('Esta licitación cierra on-chain: usá el endpoint async de cierre');
  }
  const min = listing.dossier.offeringSoftCapUsdc || 0;
  listing.status = min > 0 && listing.raisedUsdc >= min ? 'CLOSED_SUCCESS' : 'CLOSED_FAILED';
  listing.closedAt = new Date().toISOString();
  if (listing.status === 'CLOSED_SUCCESS') payListingProceeds(listing);
  save();
  return listing;
}

export function contributeListing(id: string, usdcAmount: number, accountId: string) {
  const investor = getAccount(accountId);
  if (!investor) throw new Error('Inversor no encontrado');
  requireApprovedTrader(investor);
  const listing = getListing(id);
  if (!listing) throw new Error('Listing no encontrado');
  if (listing.status !== 'LISTED') throw new Error('La licitación no está abierta');
  const amount = Number(usdcAmount);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Monto inválido');
  const price = listing.dossier.pricePerShareUsdc;
  if (price <= 0) throw new Error('Precio por acción inválido');
  const tokenCapacity = listing.tokensMinted * price;
  const remaining = Math.min(
    listing.dossier.offeringHardCapUsdc - listing.raisedUsdc,
    tokenCapacity - listing.raisedUsdc,
  );
  if (remaining <= 0) throw new Error('No queda cupo en esta licitación');
  if (amount > remaining + 1e-9) {
    throw new Error(`Solo quedan ${remaining.toLocaleString('es-AR')} USDC de cupo`);
  }
  const ticket = listing.dossier.minInvestmentUsdc || price;
  const minNow = remaining < ticket ? price : ticket;
  if (amount + 1e-9 < minNow) {
    throw new Error(`El aporte mínimo ahora es ${minNow.toLocaleString('es-AR')} USDC`);
  }
  const next = listing.raisedUsdc + amount;
  const tokens = amount / price;
  debitCash(accountId, amount);
  listing.raisedUsdc = next;
  addHolding(accountId, {
    listingId: listing.id,
    tokenTicker: listing.dossier.tokenTicker,
    usdcAmount: amount,
    tokens: 0,
    tokensOwed: tokens,
  });
  maybeCloseIfMinReached(listing.id);
  save();
  return getListing(id)!;
}

export function tradeableMarkets() {
  return listings
    .filter((l) => l.status === 'LISTED' || l.status === 'CLOSED_SUCCESS' || l.tokensMinted > 0)
    .map((l) => ({
      listingId: l.id,
      tokenTicker: l.dossier.tokenTicker,
      ticker: l.dossier.ticker,
      legalName: l.dossier.legalName,
      pricePerShareUsdc: l.dossier.pricePerShareUsdc,
      status: l.status,
    }));
}
