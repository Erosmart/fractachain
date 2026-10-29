import path from 'path';
import type { Router } from 'express';
import type { KycService } from '../../application/kyc/KycService';
import { param, type AuditMiddleware } from '../middleware/AuditMiddleware';
import { currentAccount, type AuthMiddleware } from '../middleware/AuthMiddleware';
import type { RateLimiters } from '../middleware/rateLimiters';
import { body, bodyOf, params } from '../middleware/validate';
import { noStore } from '../respond';
import { IdParam, KycRegisterBody, OnboardingKycBody, ReasonBody } from '../schemas';
import type { Controller } from './Controller';

export class KycController implements Controller {
  constructor(
    private readonly kyc: KycService,
    private readonly guard: AuthMiddleware,
    private readonly limits: RateLimiters,
    private readonly audit: AuditMiddleware,
  ) {}

  register(r: Router): void {
    r.post('/api/kyc/onboard', this.guard.requireAuth, this.limits.kycSubmit, this.audit.route('kyc.submit'), body(OnboardingKycBody), async (req, res) => {
      const user = await this.kyc.submitOnboarding(currentAccount(req).id, bodyOf(req, OnboardingKycBody));
      res.json({ success: true, user });
    });

    /** Personal data: admin or owner only, never cached, served with the type sniffed at upload. */
    r.get('/api/kyc/selfie/:id', this.guard.requireAuth, params(IdParam), this.audit.route('kyc.selfie.view', param('id')), (req, res) => {
      const image = this.kyc.selfieFor(String(req.params.id), currentAccount(req));
      noStore(res);
      res.setHeader('Content-Type', image.contentType);
      res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      // `root` keeps the dotfile check on the file name only (the data dir itself may be hidden).
      res.sendFile(path.basename(image.file), { root: path.dirname(image.file), dotfiles: 'deny' });
    });

    r.get('/api/kyc', this.guard.requireAdmin, (req, res) => {
      const data = this.kyc.queue(typeof req.query.status === 'string' ? req.query.status : undefined);
      noStore(res).json({ success: true, count: data.length, data });
    });

    r.post('/api/kyc/register', this.guard.requireAdmin, this.audit.route('kyc.register'), body(KycRegisterBody), (req, res) => {
      const record = this.kyc.register(bodyOf(req, KycRegisterBody));
      res.status(201).json({ success: true, record });
    });

    r.get('/api/kyc/:id', this.guard.requireAdmin, params(IdParam), (req, res) => {
      noStore(res).json({ success: true, data: this.kyc.get(String(req.params.id)) });
    });

    r.post('/api/kyc/:id/approve', this.guard.requireAdmin, params(IdParam), this.audit.route('kyc.approve', param('id')), (req, res) => {
      res.json(this.kyc.approve(String(req.params.id)));
    });

    r.post('/api/kyc/:id/reject', this.guard.requireAdmin, params(IdParam), this.audit.route('kyc.reject', param('id')), body(ReasonBody), (req, res) => {
      res.json(this.kyc.reject(String(req.params.id), bodyOf(req, ReasonBody).reason));
    });

    r.post('/api/kyc/:id/revoke', this.guard.requireAdmin, params(IdParam), this.audit.route('kyc.revoke', param('id')), body(ReasonBody), (req, res) => {
      res.json(this.kyc.revoke(String(req.params.id), bodyOf(req, ReasonBody).reason));
    });
  }
}
