import type { Router } from 'express';
import type { AccountPrivacyService } from '../../application/account/AccountPrivacyService';
import type { AuthService } from '../../application/auth/AuthService';
import { TermsPolicy } from '../../domain/account/Account';
import type { AuditMiddleware } from '../middleware/AuditMiddleware';
import { currentAccount, type AuthMiddleware } from '../middleware/AuthMiddleware';
import type { RateLimiters } from '../middleware/rateLimiters';
import { body, bodyOf } from '../middleware/validate';
import { noStore } from '../respond';
import { AccountCloseBody } from '../schemas';
import type { SessionCookie } from '../SessionCookie';
import type { Controller } from './Controller';

/** Legal versions and the owner's data rights (copy of the data, closing the account). */
export class AccountController implements Controller {
  constructor(
    private readonly privacy: AccountPrivacyService,
    private readonly auth: AuthService,
    private readonly cookie: SessionCookie,
    private readonly guard: AuthMiddleware,
    private readonly limits: RateLimiters,
    private readonly audit: AuditMiddleware,
    private readonly legalUpdatedAt: string,
  ) {}

  register(r: Router): void {
    /** Current Terms of Service and Privacy Policy versions (the web shows and accepts these). */
    r.get('/api/legal', (_req, res) => {
      res.json({
        success: true,
        data: {
          termsVersion: TermsPolicy.current,
          privacyVersion: TermsPolicy.current,
          updatedAt: this.legalUpdatedAt,
        },
      });
    });

    r.get(
      '/api/account/export',
      this.guard.requireAuth,
      this.limits.accountExport,
      this.audit.route('account.export'),
      (req, res) => {
        const data = this.privacy.export(currentAccount(req));
        const date = new Date().toISOString().slice(0, 10);
        noStore(res);
        res.setHeader('Content-Disposition', `attachment; filename="fractachain-mis-datos-${date}.json"`);
        res.type('application/json').send(JSON.stringify(data, null, 2));
      },
    );

    r.post(
      '/api/account/close',
      this.guard.requireAuth,
      this.limits.auth,
      this.audit.route('account.close'),
      body(AccountCloseBody),
      async (req, res) => {
        const result = await this.privacy.close(
          currentAccount(req).id,
          bodyOf(req, AccountCloseBody),
          this.auth.sessionIssuedAt(req.authToken),
        );
        this.cookie.clear(res);
        noStore(res).json({ success: true, data: result });
      },
    );
  }
}
