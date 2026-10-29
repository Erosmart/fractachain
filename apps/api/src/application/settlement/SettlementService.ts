/**
 * Closing and settlement of an offering without anyone pressing a button.
 *
 * Soroban has no scheduler: `finalize()` is an ordinary invocation some client
 * must send. This service is that client — it finalizes as soon as the
 * contract allows (hard cap or deadline) and credits every holder, so
 * "reclamar" is a retry, not a step the user must discover.
 */
import { alreadyClosedOnChain } from '../../domain/licitacion/LicitacionSnapshot';
import { settlementAction } from '../../domain/licitacion/SettlementRules';
import { paymentUnit, type Listing } from '../../domain/listing/Listing';
import { DomainError, errorMessage } from '../../shared/errors';
import type { ILogger } from '../../shared/logger';
import type { Explorer } from '../../infrastructure/stellar/Explorer';
import type { LicitacionContract } from '../../infrastructure/stellar/LicitacionContract';
import type { AccountService } from '../account/AccountService';
import type { ListingLedger } from '../listing/ListingLedger';
import type { SdexMarketService } from '../market/SdexMarketService';
import type { OnChainStatusService } from '../offering/OnChainStatusService';

export type SettlementResult = {
  accountId: string;
  claimed: number;
  distributedHash?: string | null;
  error?: string;
};

export class SettlementService {
  private sweeping = false;

  constructor(
    private readonly listings: ListingLedger,
    private readonly accounts: AccountService,
    private readonly licitacion: LicitacionContract,
    private readonly sdexMarket: SdexMarketService,
    private readonly chainStatus: OnChainStatusService,
    private readonly explorer: Explorer,
    private readonly logger: ILogger,
  ) {}

  /**
   * Credits the units of every contributor of a successful offering, and pays
   * them on-ledger for listings with a real issuer. Self-custody holders that
   * still lack a trustline get an error entry and retry via `/distribute`.
   */
  async settleHolders(listing: Listing): Promise<SettlementResult[]> {
    if (listing.status !== 'CLOSED_SUCCESS') return [];
    const results: SettlementResult[] = [];
    for (const account of this.accounts.list()) {
      const holding = (account.holdings || []).find((h) => h.listingId === listing.id);
      if (!holding || (holding.tokensOwed || 0) <= 0 || holding.refundedAt) continue;
      const owed = holding.tokensOwed || 0;
      try {
        this.accounts.addTrustline(account.id, listing.id);
        this.accounts.claimListingTokens(account.id, listing.id, true);
      } catch (err) {
        results.push({ accountId: account.id, claimed: 0, error: errorMessage(err) });
        continue;
      }
      const result: SettlementResult = { accountId: account.id, claimed: owed };
      if (this.sdexMarket.available(listing)) {
        try {
          result.distributedHash = (await this.sdexMarket.distributeClaimedTokens({ listingId: listing.id, accountId: account.id })).hash;
        } catch (err) {
          result.error = errorMessage(err);
        }
      }
      results.push(result);
    }
    return results;
  }

  /** Closes an offering: `finalize()` on-chain (which pays the company), or the sandbox equivalent. */
  async finalize(listingId: string) {
    const listing = this.listings.require(listingId);
    if (!this.listings.isOnChain(listing)) {
      const closed = this.listings.closeSandbox(listing.id);
      return { ...closed, settlements: await this.settleHolders(closed) };
    }

    const live = await this.licitacion.snapshot(listing);
    if (alreadyClosedOnChain(live)) {
      const status = this.licitacion.closeStatusFromChain(live, listing);
      if (!status) throw new DomainError('Estado on-chain ilegible');
      const updated = this.listings.markClosed(listing.id, status, live.raised, {
        finalizeHash: listing.finalizeHash,
        proceedsPaidTo: live.fiduciary,
      });
      return {
        ...updated,
        settlements: await this.settleHolders(updated),
        onChain: {
          ...this.chainStatus.chainMeta(updated),
          ...live,
          hash: listing.finalizeHash || null,
          explorer: this.explorer.tx(listing.finalizeHash),
          alreadyClosed: true,
          note:
            live.state === 1
              ? `La emisión ya estaba Successful. Los ${paymentUnit(listing)} de testnet fueron a la wallet fiduciaria en finalize(); no hay un segundo payout al inversor.`
              : `La emisión ya estaba Failed. El inversor puede llamar refund() para recuperar ${paymentUnit(listing)}.`,
        },
      };
    }

    const result = await this.licitacion.finalize(listing);
    const success = result.state === 1;
    const updated = this.listings.markClosed(listing.id, success ? 'CLOSED_SUCCESS' : 'CLOSED_FAILED', result.raised, {
      finalizeHash: result.hash,
      proceedsPaidTo: result.fiduciary,
    });
    return {
      ...updated,
      settlements: await this.settleHolders(updated),
      onChain: {
        ...this.chainStatus.chainMeta(updated),
        ...result,
        explorer: this.explorer.tx(result.hash),
        alreadyClosed: false,
        note: success
          ? `finalize() pagó los ${paymentUnit(listing)} recaudados a la wallet fiduciaria (proceeds) y las unidades quedaron acreditadas al inversor. No hace falta reclamar nada.`
          : `finalize() dejó Failed (no se llegó al soft cap). El inversor recupera ${paymentUnit(listing)} con refund().`,
      },
    };
  }

  /**
   * Closes only when the contract would accept it. Called on every
   * contribution and from the sweep, so it never throws.
   */
  async autoFinalizeIfDue(listingId: string) {
    const listing = this.listings.get(listingId);
    if (!listing) return null;
    const action = settlementAction({ status: listing.status, onChain: this.listings.isOnChain(listing) });
    if (action === 'skip') return null;
    try {
      if (action === 'settle_holders') return { ...listing, settlements: await this.settleHolders(listing) };
      const live = await this.licitacion.snapshot(listing);
      if (!live.canFinalize && !alreadyClosedOnChain(live)) return null;
      return await this.finalize(listing.id);
    } catch (err) {
      this.logger.warn('settlement automático falló', { listingId, err: errorMessage(err) });
      return null;
    }
  }

  /** Settles offerings whose deadline passed while nobody was looking. Never overlaps itself. */
  async sweepDueOfferings(): Promise<void> {
    if (this.sweeping) return;
    this.sweeping = true;
    try {
      for (const listing of this.listings.list()) {
        if (listing.status === 'LISTED' || listing.status === 'CLOSED_SUCCESS') {
          await this.autoFinalizeIfDue(listing.id);
        }
      }
    } finally {
      this.sweeping = false;
    }
  }
}
