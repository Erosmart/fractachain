import type { Router } from 'express';
import type { SupportService } from '../../application/support/SupportService';
import { param, type AuditMiddleware } from '../middleware/AuditMiddleware';
import { currentAccount, type AuthMiddleware } from '../middleware/AuthMiddleware';
import type { RateLimiters } from '../middleware/rateLimiters';
import { body, bodyOf, params } from '../middleware/validate';
import { noStore, ok } from '../respond';
import { IdParam, SupportListQuery, SupportMessageBody } from '../schemas';
import type { Controller } from './Controller';

/** Contact form (public) and the console's support inbox (admin). */
export class SupportController implements Controller {
  constructor(
    private readonly support: SupportService,
    private readonly guard: AuthMiddleware,
    private readonly limits: RateLimiters,
    private readonly audit: AuditMiddleware,
  ) {}

  register(r: Router): void {
    r.post(
      '/api/support/messages',
      this.limits.support,
      this.audit.route('support.message'),
      body(SupportMessageBody),
      async (req, res) => {
        const id = await this.support.submit(bodyOf(req, SupportMessageBody), req.account?.id);
        res.status(201).json({ success: true, data: { id } });
      },
    );

    r.get('/api/admin/support', this.guard.requireAdmin, (req, res) => {
      const parsed = SupportListQuery.safeParse(req.query);
      const status = parsed.success ? (parsed.data.status ?? 'open') : 'open';
      ok(noStore(res), this.support.list(status));
    });

    r.post(
      '/api/admin/support/:id/close',
      this.guard.requireAdmin,
      params(IdParam),
      this.audit.route('support.close', param('id')),
      (req, res) => {
        ok(res, this.support.close(String(req.params.id), currentAccount(req).id));
      },
    );

    r.post(
      '/api/admin/support/:id/reopen',
      this.guard.requireAdmin,
      params(IdParam),
      this.audit.route('support.reopen', param('id')),
      (req, res) => {
        ok(res, this.support.reopen(String(req.params.id)));
      },
    );
  }
}
