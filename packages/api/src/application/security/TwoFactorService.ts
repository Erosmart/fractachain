import type { PublicAccount } from '@fractachain/shared';
import { hasTwoFactor, type Account } from '../../domain/account/Account';
import type { IAccountRepository } from '../../domain/account/AccountRepository';
import { ConflictError, DomainError, UnauthenticatedError } from '../../shared/errors';
import type { ISecretCipher } from '../../infrastructure/security/SecretCipher';
import { RecoveryCodes, type TotpService } from '../../infrastructure/security/Totp';
import type { AccountService } from '../account/AccountService';

/**
 * TOTP second factor: enrollment (setup → confirm with a code → recovery
 * codes shown once), verification at login and removal. Secrets are sealed
 * with the same AES-GCM cipher as custodial wallet keys.
 */
export class TwoFactorService {
  constructor(
    private readonly repo: IAccountRepository,
    private readonly accounts: AccountService,
    private readonly totp: TotpService,
    private readonly cipher: ISecretCipher,
  ) {}

  setup(accountId: string): { secret: string; otpauthUrl: string } {
    const account = this.accounts.require(accountId);
    if (hasTwoFactor(account)) throw new ConflictError('La verificación en dos pasos ya está activa');
    const secret = this.totp.generateSecret();
    account.twoFactor = { ...(account.twoFactor ?? {}), pendingSecret: this.cipher.seal(secret) };
    this.repo.save(account);
    return { secret, otpauthUrl: this.totp.otpauthUrl(secret, account.email) };
  }

  enable(accountId: string, code: string): { recoveryCodes: string[]; user: PublicAccount } {
    const account = this.accounts.require(accountId);
    if (hasTwoFactor(account)) throw new ConflictError('La verificación en dos pasos ya está activa');
    const pending = account.twoFactor?.pendingSecret;
    if (!pending) throw new DomainError('Primero generá el código QR');
    const secret = this.cipher.open(pending).plain;
    const check = this.totp.verify(secret, code);
    if (!check.valid)
      throw new UnauthenticatedError('Código incorrecto. Revisá la hora de tu teléfono y probá de nuevo.');
    const recoveryCodes = RecoveryCodes.generate();
    account.twoFactor = {
      secret: pending,
      enabledAt: new Date().toISOString(),
      recoveryCodeHashes: recoveryCodes.map(RecoveryCodes.hash),
      lastUsedStep: check.step,
    };
    this.repo.save(account);
    return { recoveryCodes, user: this.accounts.toPublic(account) };
  }

  disable(accountId: string, code: string): PublicAccount {
    const account = this.accounts.require(accountId);
    if (!hasTwoFactor(account)) throw new DomainError('La verificación en dos pasos no está activa');
    if (!this.verify(account, code)) throw new UnauthenticatedError('Código incorrecto');
    account.twoFactor = undefined;
    this.repo.save(account);
    return this.accounts.toPublic(account);
  }

  /** TOTP code (not replayable) or a one-time recovery code (consumed). Persists on success. */
  verify(account: Account, code: string): boolean {
    const state = account.twoFactor;
    if (!state?.secret) return false;
    const secret = this.cipher.open(state.secret).plain;
    const totp = this.totp.verify(secret, code, state.lastUsedStep);
    if (totp.valid) {
      state.lastUsedStep = totp.step;
      this.repo.save(account);
      return true;
    }
    const hash = RecoveryCodes.hash(code);
    const idx = (state.recoveryCodeHashes ?? []).indexOf(hash);
    if (/[A-Z2-7]{5}-?[A-Z2-7]{5}/i.test(code.trim()) && idx >= 0) {
      state.recoveryCodeHashes!.splice(idx, 1);
      this.repo.save(account);
      return true;
    }
    return false;
  }
}
