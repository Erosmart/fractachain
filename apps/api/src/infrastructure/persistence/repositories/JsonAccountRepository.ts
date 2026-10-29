import type { Account } from '../../../domain/account/Account';
import type { IAccountRepository } from '../../../domain/account/AccountRepository';
import { normalizeAddress } from '../../../domain/stellar/StellarAddress';
import type { IDocumentStore } from '../DocumentStore';

export const ACCOUNTS_KEY = 'users.json';

export class JsonAccountRepository implements IAccountRepository {
  private readonly byId = new Map<string, Account>();

  constructor(private readonly store: IDocumentStore) {
    for (const raw of store.read<Account[]>(ACCOUNTS_KEY, [])) {
      this.byId.set(raw.id, JsonAccountRepository.normalize(raw));
    }
  }

  /** Fills fields older documents may lack, so the rest of the code can rely on them. */
  private static normalize(a: Account): Account {
    a.holdings = (a.holdings || []).map((h) => ({
      ...h,
      tokensOwed: h.tokensOwed || 0,
      pendingDividendUsdc: h.pendingDividendUsdc || 0,
    }));
    a.trustlines = a.trustlines || [];
    if (typeof a.cashUsdc !== 'number') a.cashUsdc = 0;
    return a;
  }

  findById(id: string): Account | undefined {
    return this.byId.get(id);
  }

  findByEmail(email: string): Account | undefined {
    const needle = email.trim().toLowerCase();
    for (const a of this.byId.values()) if (a.email === needle) return a;
    return undefined;
  }

  findByPublicKey(publicKey: string): Account | undefined {
    const needle = normalizeAddress(publicKey);
    if (!needle) return undefined;
    for (const a of this.byId.values()) if (normalizeAddress(a.publicKey) === needle) return a;
    return undefined;
  }

  findByKycId(kycId: string): Account | undefined {
    for (const a of this.byId.values()) if (a.kycId === kycId || a.id === kycId) return a;
    return undefined;
  }

  list(): Account[] {
    return [...this.byId.values()];
  }

  insert(account: Account): void {
    this.byId.set(account.id, account);
    this.save();
  }

  save(_changed?: unknown): void {
    this.store.write(ACCOUNTS_KEY, [...this.byId.values()]);
  }
}
