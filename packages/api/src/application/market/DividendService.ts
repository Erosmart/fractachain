/**
 * Cash dividends for tokenized shares (sandbox ledger).
 *
 * Mirrors `stock-vault::deposit_dividends` / `claim_dividends`: the company
 * deposits a USDC pool, it is split pro-rata across current economic holders
 * (tokens in wallet + owed at close), and each investor claims it. A holder
 * who arrives after the deposit does not inherit it — the snapshot is taken
 * at distribution time.
 */
import crypto from 'crypto';
import type { DividendDistribution, IDividendRepository } from '../../domain/market/Dividend';
import { DomainError, ValidationError } from '../../shared/errors';
import { round6 } from '../../shared/numbers';
import type { AccountService } from '../account/AccountService';
import type { ListingLedger } from '../listing/ListingLedger';

export class DividendService {
  constructor(
    private readonly repo: IDividendRepository,
    private readonly listings: ListingLedger,
    private readonly accounts: AccountService,
  ) {}

  list(listingId?: string): DividendDistribution[] {
    return this.repo
      .list()
      .filter((d) => !listingId || d.listingId === listingId)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  deposit(listingId: string, totalUsdc: number): DividendDistribution {
    const listing = this.listings.require(listingId);
    if (listing.status !== 'CLOSED_SUCCESS') {
      throw new DomainError(
        'Los dividendos se pagan cuando la licitación ya cerró con éxito y hay accionistas',
      );
    }
    if (!Number.isFinite(totalUsdc) || totalUsdc <= 0)
      throw new ValidationError('El monto del dividendo tiene que ser mayor a cero');

    const holders = this.accounts.holdersOf(listingId);
    const sharesOutstanding = holders.reduce((s, h) => s + h.shares, 0);
    if (sharesOutstanding <= 0) {
      throw new DomainError(
        'Todavía no hay tenedores para repartir. Esperá a que los inversores reclamen los tokens.',
      );
    }
    const perShare = totalUsdc / sharesOutstanding;
    let distributed = 0;
    for (const h of holders) {
      const slice = round6(h.shares * perShare);
      if (slice <= 0) continue;
      this.accounts.accrueDividend(h.accountId, listingId, slice);
      distributed += slice;
    }
    const row: DividendDistribution = {
      id: `DIV-${crypto.randomBytes(4).toString('hex')}`,
      listingId,
      tokenTicker: listing.dossier.tokenTicker,
      totalUsdc: round6(distributed),
      sharesOutstanding,
      perShare: Math.round(perShare * 1e8) / 1e8,
      holdersPaid: holders.length,
      createdAt: new Date().toISOString(),
    };
    this.repo.insert(row);
    return row;
  }

  claim(accountId: string, listingId: string) {
    return this.accounts.claimPendingDividend(accountId, listingId);
  }
}
