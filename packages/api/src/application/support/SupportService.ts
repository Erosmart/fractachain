import crypto from 'crypto';
import type { SupportMessageRequest } from '@fractachain/shared';
import type { ISupportRepository, SupportMessage } from '../../domain/support/SupportMessage';
import type { IMailer } from '../../infrastructure/mail/Mailer';
import type { IClock } from '../../shared/clock';
import { NotFoundError } from '../../shared/errors';
import type { ILogger } from '../../shared/logger';

const TOPIC_LABEL: Record<SupportMessage['topic'], string> = {
  general: 'Consulta general',
  kyc: 'Verificación de identidad',
  issuer: 'Solicitud de emisor (tokenizar una empresa)',
  privacy: 'Privacidad y datos personales',
  security: 'Seguridad',
  bug: 'Error en la plataforma',
};

/** Single-line, control-free text for email bodies and subjects (plain text only). */
const clean = (v: string, max = 4000) =>
  v
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '')
    .trim()
    .slice(0, max);

/**
 * The contact channel: messages from anyone (signed in or not), routed to the
 * admins by email and kept for the console. Privacy requests (Ley 25.326)
 * come through here too.
 */
export class SupportService {
  constructor(
    private readonly repo: ISupportRepository,
    private readonly mailer: IMailer,
    private readonly adminEmails: () => string[],
    private readonly clock: IClock,
    private readonly logger: ILogger,
  ) {}

  /** Returns the message id. A filled honeypot is accepted and silently dropped. */
  async submit(input: SupportMessageRequest, accountId?: string): Promise<string> {
    const id = `sup_${crypto.randomBytes(8).toString('hex')}`;
    if (input.website && input.website.trim()) {
      this.logger.info('mensaje de contacto descartado (honeypot)');
      return id;
    }
    const message: SupportMessage = {
      id,
      topic: input.topic,
      name: clean(input.name, 120),
      email: input.email.trim().toLowerCase(),
      message: clean(input.message),
      ...(input.company ? { company: clean(input.company, 200) } : {}),
      ...(input.cuit ? { cuit: clean(input.cuit, 20) } : {}),
      ...(typeof input.amountUsd === 'number' ? { amountUsd: input.amountUsd } : {}),
      ...(accountId ? { accountId } : {}),
      status: 'open',
      createdAt: this.clock.isoNow(),
    };
    this.repo.insert(message);
    void this.notifyAdmins(message);
    return id;
  }

  list(status: 'open' | 'closed' | 'all' = 'open'): SupportMessage[] {
    return this.repo
      .list()
      .filter((m) => status === 'all' || m.status === status)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  byAccount(accountId: string): SupportMessage[] {
    return this.repo.list().filter((m) => m.accountId === accountId);
  }

  close(id: string, adminId: string): SupportMessage {
    const message = this.require(id);
    message.status = 'closed';
    message.closedAt = this.clock.isoNow();
    message.closedBy = adminId;
    this.repo.update(message);
    return message;
  }

  reopen(id: string): SupportMessage {
    const message = this.require(id);
    message.status = 'open';
    delete message.closedAt;
    delete message.closedBy;
    this.repo.update(message);
    return message;
  }

  private require(id: string): SupportMessage {
    const message = this.repo.findById(id);
    if (!message) throw new NotFoundError('Mensaje no encontrado');
    return message;
  }

  private async notifyAdmins(m: SupportMessage): Promise<void> {
    const header = [
      `Tema: ${TOPIC_LABEL[m.topic]}`,
      `De: ${m.name} <${m.email}>`,
      m.company ? `Empresa: ${m.company}` : null,
      m.cuit ? `CUIT: ${m.cuit}` : null,
      typeof m.amountUsd === 'number' ? `Monto estimado: US$ ${m.amountUsd}` : null,
      m.accountId ? `Cuenta: ${m.accountId}` : 'Sin sesión iniciada',
    ].filter((l): l is string => Boolean(l));
    const lines = [...header, '', m.message, '', `Id: ${m.id} · ${m.createdAt}`];
    for (const to of this.adminEmails()) {
      try {
        await this.mailer.send({
          to,
          subject: `[Fractachain] ${TOPIC_LABEL[m.topic]} — ${clean(m.name, 60).replace(/[\r\n]/g, ' ')}`,
          text: lines.join('\n'),
        });
      } catch (err) {
        this.logger.warn('no se pudo avisar el mensaje de contacto', { id: m.id, err: String(err) });
      }
    }
  }
}
