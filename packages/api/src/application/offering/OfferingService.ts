import { TermsPolicy } from '../../domain/account/Account';
import { alreadyClosedOnChain, type LicitacionSnapshot } from '../../domain/licitacion/LicitacionSnapshot';
import { paymentUnit, type Listing } from '../../domain/listing/Listing';
import { DomainError, NotFoundError, ValidationError, errorMessage } from '../../shared/errors';
import { LockKeys, type ILockProvider } from '../../shared/LockProvider';
import { TtlCache } from '../../shared/TtlCache';
import type { Explorer } from '../../infrastructure/stellar/Explorer';
import type { LicitacionContract } from '../../infrastructure/stellar/LicitacionContract';
import type { AccountService } from '../account/AccountService';
import type { CustodialKeyService } from '../account/CustodialKeyService';
import type { ComplianceService } from '../compliance/ComplianceService';
import type { ListingLedger } from '../listing/ListingLedger';
import type { ListingPresenter } from '../listing/ListingPresenter';
import type { SdexMarketService } from '../market/SdexMarketService';
import type { SettlementService } from '../settlement/SettlementService';
import type { OnChainStatusService } from './OnChainStatusService';

/**
 * What an investor (or anyone, for the permissionless `finalize`) does with
 * an offering: subscribe, opt into the token, claim, refund, finalize.
 *
 * Custodial wallets are signed server-side; self-custody wallets go through
 * prepare → Freighter → submit, and the backend never holds their keys.
 */
/** Contract reads behind the offering page are reused this long (Soroban RPC round trips are slow). */
const SNAPSHOT_TTL_MS = 8_000;

export class OfferingService {
  private readonly snapshots = new TtlCache<LicitacionSnapshot>(SNAPSHOT_TTL_MS);

  /**
   * One investor action per account+listing at a time: on-chain submissions
   * book amounts from before/after reads of the contract, which concurrent
   * requests from the same wallet would otherwise interleave.
   */
  constructor(
    private readonly lock: ILockProvider,
    private readonly listings: ListingLedger,
    private readonly presenter: ListingPresenter,
    private readonly accounts: AccountService,
    private readonly custody: CustodialKeyService,
    private readonly licitacion: LicitacionContract,
    private readonly settlement: SettlementService,
    private readonly chainStatus: OnChainStatusService,
    private readonly sdexMarket: SdexMarketService,
    private readonly compliance: ComplianceService,
    private readonly explorer: Explorer,
  ) {}

  /** Listing detail with live contract state; reconciles a listing the chain already closed. */
  async detail(listingId: string, investor?: string) {
    const listing = this.listings.get(listingId);
    if (!listing) return null;
    const live = await this.snapshots.get(`${listing.id}|${investor ?? ''}`, () =>
      this.licitacion.snapshot(listing, investor),
    );
    let current = listing;
    if (this.listings.isOnChain(listing) && alreadyClosedOnChain(live) && listing.status === 'LISTED') {
      const status = this.licitacion.closeStatusFromChain(live, listing);
      if (status) {
        current = this.listings.markClosed(listing.id, status, live.raised, {
          proceedsPaidTo: live.fiduciary,
        });
        await this.settlement.settleHolders(current).catch(() => []);
      }
    }
    const meta = this.chainStatus.chainMeta(current);
    return {
      listing: current,
      validation: this.presenter.validationPack(current),
      onChain: {
        ...meta,
        ...live,
        hash: current.finalizeHash || null,
        explorer: current.finalizeHash ? this.explorer.tx(current.finalizeHash) : meta.explorer,
        finalizeExplorer: this.explorer.tx(current.finalizeHash),
      },
    };
  }

  private requireOnChain(listingId: string): Listing {
    const listing = this.listings.require(listingId);
    if (!this.listings.isOnChain(listing)) {
      throw new DomainError('La licitación todavía no está desplegada en la red');
    }
    return listing;
  }

  /** `refund()` only exists once `finalize()` left the offering in Failed. */
  private async requireFailed(listing: Listing, investor?: string): Promise<LicitacionSnapshot> {
    const live = await this.licitacion.snapshot(listing, investor);
    if (live.state !== 2 && listing.status !== 'CLOSED_FAILED') {
      throw new DomainError('refund() solo corre si finalize() dejó la emisión en Failed');
    }
    return live;
  }

  private selfCustodyWallet(accountId: string): string {
    const account = this.accounts.require(accountId);
    if (!account.publicKey) throw new DomainError('Conectá tu wallet Freighter antes de operar');
    if (account.custodyMode === 'CUSTODIAL') {
      throw new DomainError('Esta cuenta es custodial: el backend firma por vos, no hace falta Freighter');
    }
    return account.publicKey;
  }

  private async afterContribution(listingId: string, accountId: string, contributeHash?: string | null) {
    const onChain = await this.chainStatus.receiptAfterContribute(listingId, accountId, contributeHash);
    // Reaching the hard cap is what the contract waits for; closing here keeps
    // the company from having to ask someone to press a button.
    const closed = await this.settlement.autoFinalizeIfDue(listingId);
    return { ...this.listings.require(listingId), onChain: { ...onChain, autoFinalized: Boolean(closed) } };
  }

  /** Custodial subscription (the server signs with the investor's custodial key; Freighter is the default). */
  contribute(listingId: string, accountId: string, amount: number) {
    return this.fresh(
      listingId,
      this.lock.run(LockKeys.offering(accountId, listingId), () =>
        this.contributeUnlocked(listingId, accountId, amount),
      ),
    );
  }

  private async contributeUnlocked(listingId: string, accountId: string, amount: number) {
    if (!(amount > 0)) throw new ValidationError('Monto inválido');
    // Tenders settle on-chain only (Instaward 1): there is no sandbox ledger to book into.
    const listing = this.requireOnChain(listingId);
    const account = this.accounts.require(accountId);
    TermsPolicy.assertAccepted(account);
    if (account.custodyMode !== 'CUSTODIAL' || !account.publicKey) {
      throw new DomainError('Wallet propia: firmá el aporte con Freighter desde la ficha de la licitación');
    }
    const chain = await this.licitacion.contribute(listing, this.custody.keypairFor(accountId), amount);
    this.listings.recordOnChainContribution(listing.id, accountId, {
      amount: chain.amount,
      tokens: chain.tokens,
      raised: chain.raised,
    });
    return this.afterContribution(listing.id, accountId, chain.hash);
  }

  prepareContribute(listingId: string, accountId: string, amount: number, timeoutInSeconds?: number) {
    if (!(amount > 0)) throw new ValidationError('Monto inválido');
    TermsPolicy.assertAccepted(this.accounts.require(accountId));
    const listing = this.requireOnChain(listingId);
    return this.licitacion.prepareContributeXdr(
      listing,
      this.selfCustodyWallet(accountId),
      amount,
      timeoutInSeconds,
    );
  }

  /** Relays the Freighter-signed contribution; the booked amount is read from the contract. */
  submitContribute(listingId: string, accountId: string, signedXdr: string) {
    return this.fresh(
      listingId,
      this.lock.run(LockKeys.offering(accountId, listingId), () =>
        this.submitContributeUnlocked(listingId, accountId, signedXdr),
      ),
    );
  }

  private async submitContributeUnlocked(listingId: string, accountId: string, signedXdr: string) {
    const listing = this.requireOnChain(listingId);
    const wallet = this.selfCustodyWallet(accountId);
    const chain = await this.licitacion.submitContribute(listing, wallet, signedXdr);
    this.listings.recordOnChainContribution(listing.id, accountId, {
      amount: chain.amount,
      tokens: chain.tokens,
      raised: chain.raised,
    });
    return this.afterContribution(listing.id, accountId, chain.hash);
  }

  /** Custodial refund of a failed offering. */
  refund(listingId: string, accountId: string) {
    return this.fresh(
      listingId,
      this.lock.run(LockKeys.offering(accountId, listingId), () => this.refundUnlocked(listingId, accountId)),
    );
  }

  private async refundUnlocked(listingId: string, accountId: string) {
    const listing = this.requireOnChain(listingId);
    const account = this.accounts.require(accountId);
    const live = await this.requireFailed(listing, account.publicKey);
    if (account.custodyMode !== 'CUSTODIAL' || !account.publicKey) {
      throw new DomainError('Wallet propia: firmá el refund con Freighter desde la ficha de la licitación');
    }
    const result = await this.licitacion.refund(listing, this.custody.keypairFor(accountId));
    const user = this.accounts.markHoldingRefunded(accountId, listing.id, result.hash);
    return {
      user,
      refunded: result.refunded,
      rwa: result.rwa,
      onChain: {
        ...this.chainStatus.chainMeta(listing),
        ...live,
        hash: result.hash,
        explorer: this.explorer.tx(result.hash),
        note: `refund() devolvió tus ${paymentUnit(listing)} de testnet a tu wallet y quemó las unidades RWA en el contrato.`,
      },
    };
  }

  async prepareRefund(listingId: string, accountId: string, timeoutInSeconds?: number) {
    const listing = this.requireOnChain(listingId);
    const account = this.accounts.require(accountId);
    await this.requireFailed(listing, account.publicKey);
    return this.licitacion.prepareRefundXdr(listing, this.selfCustodyWallet(accountId), timeoutInSeconds);
  }

  /**
   * Permissionless `finalize()` for the investor's own wallet to sign, built
   * only when the contract would accept it (hard cap reached or deadline due).
   */
  async prepareFinalize(listingId: string, accountId: string, timeoutInSeconds?: number) {
    const listing = this.requireOnChain(listingId);
    const wallet = this.selfCustodyWallet(accountId);
    this.snapshots.forget(listing.id);
    const live = await this.licitacion.snapshot(listing);
    if (alreadyClosedOnChain(live)) throw new DomainError('La licitación ya cerró en la red');
    if (!live.canFinalize) {
      throw new DomainError('Todavía no se puede cerrar: hace falta llegar al tope o que venza el plazo');
    }
    return {
      xdr: await this.licitacion.prepareFinalizeXdr(listing, wallet, timeoutInSeconds),
      publicKey: wallet,
    };
  }

  /**
   * Books a `finalize()` an investor signed and the network executed: the
   * listing takes the state the contract settled in, with that transaction
   * as its finalize hash, and holders are settled.
   */
  async recordFinalize(listingId: string, hash: string) {
    const listing = this.listings.require(listingId);
    this.snapshots.forget(listing.id);
    const live = await this.licitacion.snapshot(listing);
    const status = this.licitacion.closeStatusFromChain(live, listing);
    if (!status || listing.status !== 'LISTED') return this.listings.require(listingId);
    const updated = this.listings.markClosed(listing.id, status, live.raised, {
      finalizeHash: hash,
      proceedsPaidTo: live.fiduciary,
    });
    await this.settlement.settleHolders(updated).catch(() => []);
    return this.listings.require(listingId);
  }

  submitRefund(listingId: string, accountId: string, signedXdr: string) {
    return this.fresh(
      listingId,
      this.lock.run(LockKeys.offering(accountId, listingId), () =>
        this.submitRefundUnlocked(listingId, accountId, signedXdr),
      ),
    );
  }

  private async submitRefundUnlocked(listingId: string, accountId: string, signedXdr: string) {
    const listing = this.requireOnChain(listingId);
    const wallet = this.selfCustodyWallet(accountId);
    const live = await this.requireFailed(listing, wallet);
    const result = await this.licitacion.submitRefund(listing, wallet, signedXdr);
    const user = this.accounts.markHoldingRefunded(accountId, listing.id, result.hash);
    return {
      user,
      refunded: result.refunded,
      rwa: result.rwa,
      onChain: {
        ...this.chainStatus.chainMeta(listing),
        ...live,
        hash: result.hash,
        explorer: this.explorer.tx(result.hash),
        note: `refund() devolvió tus ${paymentUnit(listing)} de testnet a tu wallet Freighter y quemó las unidades RWA en el contrato.`,
      },
    };
  }

  /** Permissionless finalize: the contract itself gates it on hard cap or deadline. */
  finalizeByInvestor(listingId: string) {
    const listing = this.listings.require(listingId);
    if (!this.listings.isOnChain(listing))
      throw new DomainError('La licitación todavía no está desplegada en la red');
    return this.fresh(listing.id, this.settlement.finalize(listing.id));
  }

  /** Admin retry of the payout to the company wallet (the happy path pays inside `finalize`). */
  withdrawProceeds(listingId: string) {
    return this.fresh(listingId, this.withdrawProceedsNow(listingId));
  }

  private async withdrawProceedsNow(listingId: string) {
    const listing = this.listings.require(listingId);
    if (!this.listings.isOnChain(listing)) {
      throw new DomainError(
        'withdraw_proceeds es el reintento on-chain; esta licitación no tiene contrato Soroban',
      );
    }
    const result = await this.licitacion.withdrawProceeds(listing);
    return {
      ...listing,
      onChain: {
        ...this.chainStatus.chainMeta(listing),
        hash: result.hash,
        explorer: this.explorer.tx(result.hash),
        amount: result.amount,
        note: 'Reintento de pago a la wallet fiduciaria. En el camino feliz finalize() ya pagó.',
      },
    };
  }

  /** Records the token opt-in; custodial wallets also get the on-ledger trustline. */
  async approveToken(listingId: string, accountId: string) {
    const user = this.accounts.addTrustline(accountId, listingId);
    const listing = this.listings.get(listingId);
    const account = this.accounts.require(accountId);
    if (listing && this.sdexMarket.available(listing) && account.custodyMode === 'CUSTODIAL') {
      await this.sdexMarket.openCustodialTrustline({ listingId: listing.id, accountId });
    } else if (
      listing &&
      this.sdexMarket.available(listing) &&
      account.publicKey &&
      account.kycStatus === 'APPROVED'
    ) {
      await this.compliance.sync(account.publicKey, true);
    }
    return user;
  }

  /** Claims owed units of a closed offering and, for SDEX listings, pays them on-ledger. */
  claim(listingId: string, accountId: string) {
    return this.fresh(listingId, this.claimNow(listingId, accountId));
  }

  private async claimNow(listingId: string, accountId: string) {
    const listing = this.listings.get(listingId);
    if (!listing) throw new NotFoundError('Listing no encontrado');
    const account = this.accounts.require(accountId);
    const user = this.accounts.claimListingTokens(accountId, listingId, listing.status === 'CLOSED_SUCCESS');
    const live = await this.licitacion.snapshot(listing, account.publicKey);
    const distribution = this.sdexMarket.available(listing)
      ? await this.sdexMarket
          .distributeClaimedTokens({ listingId: listing.id, accountId })
          .catch((err: unknown) => ({ error: errorMessage(err) || 'error' }))
      : null;
    return {
      ...user,
      distribution,
      onChain: {
        ...this.chainStatus.chainMeta(listing),
        ...live,
        note:
          listing.dossier.paymentKind === 'XLM'
            ? 'Anotar en el portfolio no mueve XLM. Las unidades RWA ya existen en el contrato desde contribute(); finalize() pagó a la empresa.'
            : 'Tokens acreditados en el ledger de la plataforma.',
      },
    };
  }

  distribute(listingId: string, accountId: string) {
    return this.fresh(listingId, this.sdexMarket.distributeClaimedTokens({ listingId, accountId }));
  }

  /** Runs a write and drops the cached contract reads of that offering once it settles. */
  private fresh<T>(listingId: string, write: Promise<T>): Promise<T> {
    return write.finally(() => this.snapshots.forget(listingId));
  }
}
