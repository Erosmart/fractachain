import type { ILogger } from '../../shared/logger';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface IMailer {
  send(message: MailMessage): Promise<void>;
}

/**
 * Development mailer: writes the message (with its links) to the log, so the
 * verification / reset flows work locally without an SMTP server.
 */
export class LogMailer implements IMailer {
  constructor(private readonly logger: ILogger) {}

  async send(message: MailMessage): Promise<void> {
    this.logger.info('email (sin SMTP: se muestra en el log)', {
      to: message.to,
      subject: message.subject,
      body: message.text,
    });
  }
}

/** SMTP delivery through nodemailer, configured with a single `SMTP_URL`. */
export class SmtpMailer implements IMailer {
  private transport: Promise<{ sendMail(opts: Record<string, unknown>): Promise<unknown> }>;

  constructor(
    smtpUrl: string,
    private readonly from: string,
  ) {
    this.transport = import('nodemailer').then((m) => m.createTransport(smtpUrl));
  }

  async send(message: MailMessage): Promise<void> {
    const transport = await this.transport;
    await transport.sendMail({
      from: this.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
  }
}
