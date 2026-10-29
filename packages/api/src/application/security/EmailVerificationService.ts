import type { PublicAccount } from '@fractachain/shared';
import { isEmailVerified, isWalletEmail, type Account } from '../../domain/account/Account';
import type { IAccountRepository } from '../../domain/account/AccountRepository';
import { DomainError, ValidationError } from '../../shared/errors';
import type { ILogger } from '../../shared/logger';
import type { IMailer } from '../../infrastructure/mail/Mailer';
import { SignedTokenCodec } from '../../infrastructure/security/SignedTokens';
import type { AccountService } from '../account/AccountService';
import type { IRegistrationListener } from '../auth/AuthService';
import type { IEmailChangeListener } from '../kyc/KycService';

const VERIFY_TTL_MS = 24 * 3_600_000;

/** Confirms that an email/password account owns its address (link sent by email). */
export class EmailVerificationService implements IRegistrationListener, IEmailChangeListener {
  constructor(
    private readonly repo: IAccountRepository,
    private readonly accounts: AccountService,
    private readonly tokens: SignedTokenCodec,
    private readonly mailer: IMailer,
    private readonly appUrl: string,
    private readonly logger: ILogger,
  ) {}

  onEmailRegistered(account: Account): Promise<void> {
    return this.send(account);
  }

  onEmailChanged(account: Account): Promise<void> {
    return this.send(account);
  }

  /** Sends the link; never throws (a mail outage must not break registration). */
  async send(account: Account): Promise<void> {
    if (isEmailVerified(account) || isWalletEmail(account.email)) return;
    const { token } = this.tokens.issue(
      'email-verify',
      account.id,
      VERIFY_TTL_MS,
      SignedTokenCodec.fingerprint(account.email),
    );
    const link = `${this.appUrl}/verify-email?token=${encodeURIComponent(token)}`;
    try {
      await this.mailer.send({
        to: account.email,
        subject: 'Confirmá tu email en Fractachain',
        text: `Hola ${account.name || ''}:\n\nConfirmá tu email entrando a este link (vence en 24 horas):\n${link}\n\nSi no creaste una cuenta en Fractachain, ignorá este mensaje.`,
      });
    } catch (err) {
      this.logger.warn('no se pudo enviar el email de verificación', {
        accountId: account.id,
        err: String(err),
      });
    }
  }

  async resend(accountId: string): Promise<void> {
    const account = this.accounts.require(accountId);
    if (isEmailVerified(account)) throw new DomainError('Tu email ya está verificado');
    await this.send(account);
  }

  verify(token: string): PublicAccount {
    const claims = this.tokens.verify('email-verify', token, (sub) =>
      SignedTokenCodec.fingerprint(this.accounts.get(sub)?.email),
    );
    if (!claims) throw new ValidationError('El link de verificación es inválido o venció. Pedí uno nuevo.');
    const account = this.accounts.require(claims.sub);
    if (!account.emailVerifiedAt) {
      account.emailVerifiedAt = new Date().toISOString();
      this.repo.save(account);
    }
    return this.accounts.toPublic(account);
  }
}
