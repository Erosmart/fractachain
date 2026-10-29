import crypto from 'crypto';
import { TraderPolicy } from '../../domain/account/Account';
import {
  DossierValidator,
  assertListed,
  isOnChainListing,
  type CompanyDossier,
  type Listing,
  type SettleChoice,
} from '../../domain/listing/Listing';
import type { IListingRepository } from '../../domain/listing/ListingRepository';
import { isStellarPublicKey, normalizeAddress } from '../../domain/stellar/StellarAddress';
import type { INetworkSettingsProvider } from '../../domain/testnet/NetworkSettings';
import { ConflictError, DomainError, NotFoundError, ValidationError } from '../../shared/errors';
import { EPSILON } from '../../shared/numbers';
import type { AccountService } from '../account/AccountService';

/** Platform-ledger view of a listing's contract addresses (no RPC). */
export interface ListingChainDefaults {
  platformIssuerPublicKey(): string | null;
  deploymentIssuer(): string | null;
  sharedStockVault(): string | null;
}

/**
 * The listing aggregate: lifecycle state, contributions recorded on the
 * platform ledger and closing rules for sandbox offerings.
 *
 * Reads apply the sandbox settlement policy lazily (`applyDueClose`), exactly
 * like v1, so a sandbox offering that met its minimum closes the next time
 * anyone looks at it. On-chain offerings only close through `finalize()`.
 */
export class ListingLedger {
  constructor(
    private readonly repo: IListingRepository,
    private readonly accounts: AccountService,
    private readonly network: INetworkSettingsProvider,
    private readonly chain: ListingChainDefaults,
  ) {}

  /* ------------------------------------ reads ------------------------------------ */

  list(): Listing[] {
    const all = this.repo.list();
    all.forEach((l) => this.applyDueClose(l));
    return all.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  get(id: string): Listing | undefined {
    const listing = this.repo.findById(id);
    if (listing) this.applyDueClose(listing);
    return listing;
  }

  require(id: string): Listing {
    const listing = this.get(id);
    if (!listing) throw new NotFoundError('Listing no encontrado');
    return listing;
  }

  /** Read without applying due-close (used where v1 read the raw array). */
  peek(id: string): Listing {
    const listing = this.repo.findById(id);
    if (!listing) throw new NotFoundError('Listing no encontrado');
    return listing;
  }

  isOnChain(listing: Listing): boolean {
    return isOnChainListing(listing);
  }

  save(listing: Listing): void {
    this.repo.save(listing);
  }

  /* ------------------------------------ issuance lifecycle ------------------------------------ */

  create(dossier: CompanyDossier): Listing {
    DossierValidator.assertComplete(dossier);
    const ticker = dossier.ticker.trim().toUpperCase();
    if (this.repo.list().some((l) => l.dossier.ticker === ticker)) {
      throw new ConflictError(`Ya existe un listing para ${ticker}`);
    }
    // Default to an issuer the backend can sign with: issuing under an account
    // we do not control leaves the tokens undistributable.
    const issuer =
      dossier.issuerPublicKey.trim() || this.chain.platformIssuerPublicKey() || this.chain.deploymentIssuer() || '';
    const listing: Listing = {
      id: `IPO-${ticker}-${Date.now().toString(36)}`,
      dossier: {
        ...dossier,
        ticker,
        tokenTicker: dossier.tokenTicker.trim().toUpperCase(),
        issuerPublicKey: issuer,
        proceedsWallet: normalizeAddress(dossier.proceedsWallet),
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
    this.repo.insert(listing);
    return listing;
  }

  /** Pre-deploy validation, run *before* paying for the on-chain vault deploy. */
  assertDeployable(id: string): Listing {
    const listing = this.require(id);
    DossierValidator.assertComplete(listing.dossier);
    if (listing.status !== 'DRAFT') throw new ConflictError('Ya está deployado');
    return listing;
  }

  /** Caja de Valores deposit hash, derived identically at deploy and mint time. */
  cvDepositHash(listing: Listing): string {
    return crypto.createHash('sha256').update(`${listing.dossier.cajaSubaccount}:${listing.dossier.isin}`).digest('hex');
  }

  markDeployed(id: string, onChain?: { contractId: string }): Listing {
    const listing = this.assertDeployable(id);
    listing.stockContract = onChain?.contractId || this.chain.sharedStockVault() || ListingLedger.syntheticContractId(`${listing.id}:stock`);
    // The licitación gets its own instance when the offering opens.
    listing.licitacionContract = '';
    listing.factoryProductId = this.repo.list().filter((l) => l.factoryProductId).length + 1;
    listing.deployedAt = new Date().toISOString();
    listing.status = 'DEPLOYED';
    listing.cvDepositHash = this.cvDepositHash(listing);
    if (!isStellarPublicKey(listing.dossier.issuerPublicKey)) {
      listing.dossier.issuerPublicKey = this.chain.platformIssuerPublicKey() || this.chain.deploymentIssuer() || '';
    }
    this.repo.save(listing);
    return listing;
  }

  /** Mint pre-checks, run before the on-chain mint so a rejection never orphans a balance. */
  assertMintable(id: string, amount: number): Listing {
    const listing = this.require(id);
    if (listing.status === 'DRAFT') throw new DomainError('Primero deployá el contrato');
    if (!Number.isFinite(amount) || amount <= 0) throw new ValidationError('Monto inválido');
    if (listing.tokensMinted + amount > listing.dossier.sharesToTokenize) {
      throw new DomainError('No se puede mintear más que las acciones a tokenizar');
    }
    return listing;
  }

  recordMint(id: string, amount: number): Listing {
    const listing = this.assertMintable(id, amount);
    const next = listing.tokensMinted + amount;
    listing.tokensMinted = next;
    listing.sharesCustodied = next;
    listing.mintedAt = new Date().toISOString();
    listing.status = 'TOKENS_MINTED';
    this.repo.save(listing);
    return listing;
  }

  /** Checks a listing can open and returns when its offering will close. */
  prepareOpen(id: string, opts?: SettleChoice): { listing: Listing; deadlineMs: number } {
    const listing = this.peek(id);
    if (listing.tokensMinted <= 0) throw new DomainError('Primero minteá los tokens respaldados 1:1');
    if (listing.status === 'LISTED') throw new ConflictError('Ya está en licitación');
    if (!isStellarPublicKey(listing.dossier.proceedsWallet)) {
      throw new DomainError('Configurá la wallet de cobro de la empresa antes de abrir la licitación');
    }
    const { settleAt } = this.resolveSettleChoice(opts);
    const days = listing.dossier.offeringDays > 0 ? listing.dossier.offeringDays : 30;
    const deadlineMs = settleAt ? new Date(settleAt).getTime() : Date.now() + days * 86_400_000;
    if (!Number.isFinite(deadlineMs) || deadlineMs <= Date.now()) throw new ValidationError('La fecha de cierre tiene que ser futura');
    return { listing, deadlineMs };
  }

  markOpen(id: string, opts?: SettleChoice, onChain?: { contractId: string; factoryProductId?: number | null }): Listing {
    const { listing } = this.prepareOpen(id, opts);
    listing.licitacionContract = onChain?.contractId || ListingLedger.syntheticContractId(`${listing.id}:licitacion`);
    if (onChain?.factoryProductId != null) listing.factoryProductId = onChain.factoryProductId;
    listing.status = 'LISTED';
    listing.listedAt = new Date().toISOString();
    this.applySettleChoice(listing, opts);
    this.repo.save(listing);
    return listing;
  }

  /**
   * Repoints the company wallet. Mirrors `set_fiduciary`'s guard: once money is
   * in, the payout address is part of the deal investors agreed to.
   */
  setProceedsWallet(id: string, wallet: string): Listing {
    const listing = this.peek(id);
    const next = normalizeAddress(wallet);
    if (!isStellarPublicKey(next)) {
      throw new ValidationError('La wallet que recibe la licitación no es una dirección Stellar válida (debe empezar con G)');
    }
    if (next === normalizeAddress(listing.dossier.issuerPublicKey)) {
      throw new ValidationError('La wallet que cobra no puede ser la cuenta emisora del token');
    }
    if (listing.raisedUsdc > 0) throw new ConflictError('Ya hay inversores que aportaron: la wallet de cobro no se puede cambiar');
    listing.dossier.proceedsWallet = next;
    this.repo.save(listing);
    return listing;
  }

  setSettle(id: string, opts?: SettleChoice): Listing {
    const listing = this.peek(id);
    assertListed(listing);
    this.applySettleChoice(listing, opts);
    this.repo.save(listing);
    this.applyDueClose(listing);
    return listing;
  }

  /* ------------------------------------ contributions & closing ------------------------------------ */

  /** Sandbox primary: debits sandbox cash and books the units as owed. */
  contributeSandbox(id: string, usdcAmount: number, accountId: string): Listing {
    const investor = this.accounts.require(accountId);
    TraderPolicy.assertCanTrade(investor);
    const listing = this.require(id);
    assertListed(listing);
    const amount = Number(usdcAmount);
    if (!Number.isFinite(amount) || amount <= 0) throw new ValidationError('Monto inválido');
    const price = listing.dossier.pricePerShareUsdc;
    if (price <= 0) throw new DomainError('Precio por acción inválido');
    const remaining = Math.min(
      listing.dossier.offeringHardCapUsdc - listing.raisedUsdc,
      listing.tokensMinted * price - listing.raisedUsdc,
    );
    if (remaining <= 0) throw new DomainError('No queda cupo en esta licitación');
    if (amount > remaining + EPSILON) throw new DomainError(`Solo quedan ${remaining.toLocaleString('es-AR')} USDC de cupo`);
    const ticket = listing.dossier.minInvestmentUsdc || price;
    const minNow = remaining < ticket ? price : ticket;
    if (amount + EPSILON < minNow) throw new DomainError(`El aporte mínimo ahora es ${minNow.toLocaleString('es-AR')} USDC`);

    this.accounts.debitCash(accountId, amount);
    listing.raisedUsdc += amount;
    this.accounts.addHolding(accountId, {
      listingId: listing.id,
      tokenTicker: listing.dossier.tokenTicker,
      usdcAmount: amount,
      tokens: 0,
      tokensOwed: amount / price,
    });
    this.applyDueClose(listing);
    this.repo.save(listing);
    return this.require(id);
  }

  /** Books a contribution that already settled on-chain. `amount` must come from the chain. */
  recordOnChainContribution(id: string, accountId: string, input: { amount: number; tokens: number; raised: number }): Listing {
    const listing = this.require(id);
    const units = listing.dossier.pricePerShareUsdc > 0 ? input.amount / listing.dossier.pricePerShareUsdc : input.tokens;
    if (units > 0) {
      this.accounts.addHolding(accountId, {
        listingId: listing.id,
        tokenTicker: listing.dossier.tokenTicker,
        usdcAmount: input.amount,
        tokens: 0,
        tokensOwed: units,
      });
    }
    listing.raisedUsdc = input.raised;
    this.repo.save(listing);
    return this.require(id);
  }

  markClosed(
    id: string,
    status: 'CLOSED_SUCCESS' | 'CLOSED_FAILED',
    raised?: number,
    extra?: { finalizeHash?: string | null; proceedsPaidTo?: string | null },
  ): Listing {
    const listing = this.require(id);
    listing.status = status;
    listing.closedAt = new Date().toISOString();
    if (typeof raised === 'number') listing.raisedUsdc = raised;
    if (extra?.finalizeHash) {
      listing.finalizeHash = extra.finalizeHash;
      listing.finalizeAt = new Date().toISOString();
    }
    if (status === 'CLOSED_SUCCESS') this.payProceeds(listing);
    if (extra?.proceedsPaidTo) listing.proceedsPaidTo = extra.proceedsPaidTo;
    this.repo.save(listing);
    return this.require(id);
  }

  /** Admin close of a sandbox offering. On-chain offerings close through `finalize()`. */
  closeSandbox(id: string): Listing {
    const listing = this.require(id);
    assertListed(listing);
    if (this.isOnChain(listing)) throw new DomainError('Esta licitación cierra on-chain: usá el endpoint async de cierre');
    const min = listing.dossier.offeringSoftCapUsdc || 0;
    listing.status = min > 0 && listing.raisedUsdc >= min ? 'CLOSED_SUCCESS' : 'CLOSED_FAILED';
    listing.closedAt = new Date().toISOString();
    if (listing.status === 'CLOSED_SUCCESS') this.payProceeds(listing);
    this.repo.save(listing);
    return listing;
  }

  /* ------------------------------------ internals ------------------------------------ */

  private resolveSettleChoice(opts?: SettleChoice): SettleChoice {
    const cfg = this.network.get();
    const policy = opts?.settlePolicy || cfg.settlePolicy || 'ON_MIN';
    if (policy !== 'ON_DATE') return { settlePolicy: 'ON_MIN' };
    const at = opts?.settleAt || cfg.settleAt;
    if (!at) throw new ValidationError('Indicá la fecha hasta la que esperás para repartir tokens');
    const date = new Date(at);
    if (Number.isNaN(date.getTime())) throw new ValidationError('Fecha de cierre inválida');
    return { settlePolicy: 'ON_DATE', settleAt: date.toISOString() };
  }

  private applySettleChoice(listing: Listing, opts?: SettleChoice): void {
    const { settlePolicy, settleAt } = this.resolveSettleChoice(opts);
    listing.settlePolicy = settlePolicy;
    listing.settleAt = settleAt;
  }

  private applyDueClose(listing: Listing): void {
    if (listing.status !== 'LISTED' || this.isOnChain(listing)) return;
    const min = listing.dossier.offeringSoftCapUsdc || listing.dossier.minInvestmentUsdc || 0;
    const policy = listing.settlePolicy || 'ON_MIN';
    if (policy === 'ON_MIN' && min > 0 && listing.raisedUsdc >= min) {
      listing.status = 'CLOSED_SUCCESS';
      listing.closedAt = new Date().toISOString();
      this.payProceeds(listing);
      this.repo.save(listing);
      return;
    }
    if (policy === 'ON_DATE' && listing.settleAt && Date.now() >= new Date(listing.settleAt).getTime()) {
      listing.status = min > 0 && listing.raisedUsdc >= min ? 'CLOSED_SUCCESS' : 'CLOSED_FAILED';
      listing.closedAt = new Date().toISOString();
      if (listing.status === 'CLOSED_SUCCESS') this.payProceeds(listing);
      this.repo.save(listing);
    }
  }

  /**
   * Records the payout to the company wallet when an offering closes. For
   * sandbox offerings whose wallet belongs to a platform account, the raise is
   * also credited as sandbox cash; on-chain, `finalize()` already moved it.
   */
  private payProceeds(listing: Listing): void {
    if (listing.proceedsPaidAt || listing.status !== 'CLOSED_SUCCESS') return;
    const wallet = normalizeAddress(listing.dossier.proceedsWallet);
    if (!isStellarPublicKey(wallet)) return;
    listing.proceedsPaidTo = wallet;
    listing.proceedsPaidAt = new Date().toISOString();
    if (this.isOnChain(listing)) return;
    const company = this.accounts.findByPublicKey(wallet);
    if (company && listing.raisedUsdc > 0) this.accounts.creditCash(company.id, listing.raisedUsdc);
  }

  /** Placeholder id for sandbox listings (never a valid StrKey checksum). */
  private static syntheticContractId(seed: string): string {
    const h = crypto.createHash('sha256').update(seed).digest('hex').toUpperCase();
    return `C${h.slice(0, 55)}`;
  }
}
