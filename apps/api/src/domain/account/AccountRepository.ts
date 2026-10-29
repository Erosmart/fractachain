import type { Account } from './Account';

/**
 * Account persistence port.
 *
 * Accounts are mutated in place by the application services and then handed
 * back through `save`, which persists the whole collection — the same
 * whole-document model v1 used, now behind an interface.
 */
export interface IAccountRepository {
  findById(id: string): Account | undefined;
  findByEmail(email: string): Account | undefined;
  findByPublicKey(publicKey: string): Account | undefined;
  findByKycId(kycId: string): Account | undefined;
  list(): Account[];
  insert(account: Account): void;
  save(account?: Account): void;
}
