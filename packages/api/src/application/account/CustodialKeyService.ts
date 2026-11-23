import { Keypair } from '@stellar/stellar-sdk';
import type { Account } from '../../domain/account/Account';
import type { IAccountRepository } from '../../domain/account/AccountRepository';
import { DomainError, NotFoundError } from '../../shared/errors';
import type { ISecretCipher } from '../../infrastructure/security/SecretCipher';

/**
 * Custody of platform-generated wallets.
 *
 * Deliberately narrow: only `CUSTODIAL` accounts resolve a key. A `SELF`
 * account signs in its own wallet and the platform must never be able to act
 * for it, so asking for its key is a bug and throws.
 */
export class CustodialKeyService {
  constructor(
    private readonly accounts: IAccountRepository,
    private readonly cipher: ISecretCipher,
  ) {}

  /** Generates a fresh custodial wallet for the account (does not persist). */
  assignNewWallet(account: Account): void {
    const kp = Keypair.random();
    account.custodyMode = 'CUSTODIAL';
    account.publicKey = kp.publicKey();
    account.secretKey = this.cipher.seal(kp.secret());
    account.recoveryHint = 'custodia-fractachain';
  }

  secretFor(accountId: string): string {
    const account = this.accounts.findById(accountId);
    if (!account) throw new NotFoundError('Cuenta no encontrada');
    return this.secretOf(account);
  }

  secretOf(account: Account): string {
    if (account.custodyMode !== 'CUSTODIAL' || !account.secretKey) {
      throw new DomainError('Esta cuenta es de autocustodia: firmá la orden desde tu wallet');
    }
    const { plain, resealed } = this.cipher.open(account.secretKey);
    if (resealed) {
      // Opened with WALLET_PEPPER_PREVIOUS: persist under the current key.
      account.secretKey = resealed;
      this.accounts.save(account);
    }
    return plain;
  }

  keypairFor(accountId: string): Keypair {
    return Keypair.fromSecret(this.secretFor(accountId));
  }

  /** Custodial secret when the platform holds the key, otherwise `null`. */
  optionalSecretOf(account: Account): string | null {
    return account.custodyMode === 'CUSTODIAL' && account.secretKey ? this.secretOf(account) : null;
  }

  /** Seals any v1 plaintext secret left in storage. Returns how many were migrated. */
  sealLegacySecrets(): number {
    let migrated = 0;
    for (const account of this.accounts.list()) {
      if (account.secretKey && !this.cipher.isSealed(account.secretKey)) {
        account.secretKey = this.cipher.seal(account.secretKey);
        migrated++;
      }
    }
    if (migrated) this.accounts.save();
    return migrated;
  }
}
