import crypto from 'crypto';
import type { AuditContext, AuditEntry, IAuditRepository } from '../../domain/audit/AuditEntry';
import type { IClock } from '../../shared/clock';

export interface AuditQuery {
  limit?: number;
  /** Action prefix, e.g. `kyc.` or `auth.login`. */
  action?: string;
  /** Free text over actor email, target and action. */
  actor?: string;
}

/** Keys never written to the trail, even if a caller passes them as details. */
const SENSITIVE = /^(secret|secretKey|secretOnce|password|token|idToken|code|seed|privateKey|xdr|challenge)$/i;

/**
 * Security audit trail: who did what, to what, from where, and whether it
 * worked. Admin actions and security events (logins, 2FA, password resets,
 * key exports) are recorded; secrets never are.
 */
export class AuditTrail {
  constructor(
    private readonly repo: IAuditRepository,
    private readonly clock: IClock,
  ) {}

  record(
    context: AuditContext,
    action: string,
    target: string | null,
    outcome: 'success' | 'failure' = 'success',
    details?: Record<string, unknown>,
  ): AuditEntry {
    const entry: AuditEntry = {
      id: `aud_${crypto.randomBytes(8).toString('hex')}`,
      at: this.clock.isoNow(),
      actorId: context.actorId,
      actorEmail: context.actorEmail,
      action,
      target,
      ip: context.ip,
      requestId: context.requestId,
      outcome,
      ...(details ? { details: AuditTrail.redact(details) } : {}),
    };
    this.repo.append(entry);
    return entry;
  }

  query(q: AuditQuery = {}): AuditEntry[] {
    const limit = Math.min(Math.max(q.limit ?? 200, 1), 1_000);
    const text = q.actor?.trim().toLowerCase();
    return this.repo
      .list()
      .filter((e) => !q.action || e.action.startsWith(q.action))
      .filter((e) => !text || [e.actorEmail, e.target, e.action].some((v) => v?.toLowerCase().includes(text)))
      .slice(0, limit);
  }

  private static redact(details: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(Object.entries(details).filter(([k]) => !SENSITIVE.test(k)));
  }
}
