import type { IAccountRepository } from '../../domain/account/AccountRepository';
import { ValidationError } from '../../shared/errors';
import type { ILogger } from '../../shared/logger';
import type { IMailer } from '../../infrastructure/mail/Mailer';
import { PasswordPolicy, type IPasswordHasher } from '../../infrastructure/security/PasswordHasher';
import { SignedTokenCodec } from '../../infrastructure/security/SignedTokens';
import type { IClock } from '../../shared/clock';

const RESET_TTL_MS = 30 * 60_000;

/**
 * "Olvidé mi contraseña". The request answers the same whether or not the
 * email exists (no account enumeration); the link expires in 30 minutes and
 * dies as soon as the password changes. A reset signs out every session.
 */
export class PasswordResetService {
  constructor(
    private readonly repo: IAccountRepository,
    private readonly hasher: IPasswordHasher,
    private readonly tokens: SignedTokenCodec,
    private readonly mailer: IMailer,
    private readonly appUrl: string,
    private readonly clock: IClock,
    private readonly logger: ILogger,
  ) {}

  async request(email: string): Promise<void> {
    const account = this.repo.findByEmail(
      String(email || '')
        .trim()
        .toLowerCase(),
    );
    // Only password accounts can reset; Google/wallet accounts have nothing to reset.
    if (!account?.passwordHash) return;
    const { token } = this.tokens.issue(
      'password-reset',
      account.id,
      RESET_TTL_MS,
      SignedTokenCodec.fingerprint(account.passwordHash),
    );
    const link = `${this.appUrl}/reset-password?token=${encodeURIComponent(token)}`;
    try {
      await this.mailer.send({
        to: account.email,
        subject: 'Restablecé tu contraseña de Fractachain',
        text: `Recibimos un pedido para cambiar tu contraseña. El link vence en 30 minutos:\n${link}\n\nSi no fuiste vos, ignorá este mensaje: tu contraseña sigue siendo la misma.`,
      });
    } catch (err) {
      this.logger.warn('no se pudo enviar el email de reseteo', { accountId: account.id, err: String(err) });
    }
  }

  /** Sets the new password and revokes every existing session. Returns the account id. */
  async reset(token: string, password: string): Promise<string> {
    const claims = this.tokens.verify('password-reset', token, (sub) =>
      SignedTokenCodec.fingerprint(this.repo.findById(sub)?.passwordHash),
    );
    if (!claims)
      throw new ValidationError('El link para cambiar la contraseña es inválido o venció. Pedí uno nuevo.');
    const problem = PasswordPolicy.assertAcceptable(password);
    if (problem) throw new ValidationError(problem);
    const account = this.repo.findById(claims.sub);
    if (!account)
      throw new ValidationError('El link para cambiar la contraseña es inválido o venció. Pedí uno nuevo.');
    account.passwordHash = await this.hasher.hash(password);
    // Proving control of the inbox also proves the email.
    account.emailVerifiedAt = account.emailVerifiedAt || this.clock.isoNow();
    account.sessionsRevokedAt = this.clock.now();
    this.repo.save(account);
    return account.id;
  }
}
