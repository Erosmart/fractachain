import type { Account } from '../../domain/account/Account';
import { isWalletEmail } from '../../domain/account/Account';
import type { IMailer } from '../../infrastructure/mail/Mailer';
import type { ILogger } from '../../shared/logger';
import type { IPasswordChangeNotifier } from '../auth/AuthService';

/** Security emails the owner should get even if they didn't ask (password changed…). */
export class MailSecurityNotices implements IPasswordChangeNotifier {
  constructor(
    private readonly mailer: IMailer,
    private readonly appUrl: string,
    private readonly logger: ILogger,
  ) {}

  async onPasswordChanged(account: Account): Promise<void> {
    if (isWalletEmail(account.email)) return;
    try {
      await this.mailer.send({
        to: account.email,
        subject: 'Tu contraseña de Fractachain cambió',
        text:
          'La contraseña de tu cuenta se cambió recién y cerramos las demás sesiones abiertas.\n\n' +
          `Si no fuiste vos, recuperá el acceso en ${this.appUrl}/forgot-password y escribinos desde ` +
          `${this.appUrl}/contacto.`,
      });
    } catch (err) {
      this.logger.warn('no se pudo avisar el cambio de contraseña', {
        accountId: account.id,
        err: String(err),
      });
    }
  }
}
