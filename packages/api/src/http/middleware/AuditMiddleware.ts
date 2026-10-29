import type { Request, RequestHandler } from 'express';
import type { AuditTrail } from '../../application/audit/AuditTrail';
import type { AuditContext } from '../../domain/audit/AuditEntry';

export type TargetOf = (req: Request) => string | null | undefined;

/** Builds the audit context (actor, IP, request id) from a request. */
export function auditContext(req: Request): AuditContext {
  return {
    actorId: req.account?.id ?? null,
    actorEmail: req.account?.email ?? null,
    ip: req.ip ?? null,
    requestId: req.requestId ?? null,
  };
}

/**
 * Declarative audit: `audit.route('kyc.approve', (req) => req.params.id)` on a
 * route records one entry when the response finishes — success for 2xx/3xx,
 * failure otherwise — with the actor resolved at that moment (so a login
 * entry carries the account it just authenticated).
 */
export class AuditMiddleware {
  constructor(private readonly trail: AuditTrail) {}

  route(action: string, target?: TargetOf): RequestHandler {
    return (req, res, next) => {
      res.on('finish', () => {
        const ctx = auditContext(req);
        const outcome = res.statusCode < 400 ? 'success' : 'failure';
        const details = res.statusCode >= 400 ? { status: res.statusCode } : undefined;
        try {
          this.trail.record(ctx, action, target?.(req) ?? null, outcome, details);
        } catch {
          // auditing must never break the request
        }
      });
      next();
    };
  }

  /** Same, for events recorded from inside a handler. */
  record(req: Request, action: string, target: string | null, outcome: 'success' | 'failure' = 'success', details?: Record<string, unknown>): void {
    this.trail.record(auditContext(req), action, target, outcome, details);
  }
}

export const param = (name: string): TargetOf => (req) => (req.params?.[name] ? String(req.params[name]) : null);
export const bodyField = (name: string): TargetOf => (req) => {
  const value = (req.body as Record<string, unknown> | undefined)?.[name];
  return typeof value === 'string' ? value.trim().toLowerCase() : null;
};
