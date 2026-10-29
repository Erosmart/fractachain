import type { Router } from 'express';
import type { ComplianceService } from '../../application/compliance/ComplianceService';
import type { NetworkAdminService } from '../../application/testnet/NetworkAdminService';
import type { AuthMiddleware } from '../middleware/AuthMiddleware';
import type { RateLimiters } from '../middleware/rateLimiters';
import { body, bodyOf } from '../middleware/validate';
import { ok } from '../respond';
import { ComplianceSyncBody, ConfigureIssuerBody, NetworkSettingsBody } from '../schemas';
import type { Controller } from './Controller';

/** Admin → Testnet and compliance reconciliation. */
export class AdminOpsController implements Controller {
  constructor(
    private readonly network: NetworkAdminService,
    private readonly compliance: ComplianceService,
    private readonly guard: AuthMiddleware,
    private readonly limits: RateLimiters,
  ) {}

  register(r: Router): void {
    const admin = this.guard.requireAdmin;

    r.get('/api/admin/testnet', admin, async (_req, res) => {
      ok(res, await this.network.overview());
    });

    r.post('/api/admin/testnet', admin, body(NetworkSettingsBody), (req, res) => {
      ok(res, this.network.update(bodyOf(req, NetworkSettingsBody)));
    });

    r.post('/api/admin/testnet/configure-issuer', admin, this.limits.heavyAdmin, body(ConfigureIssuerBody), async (req, res) => {
      ok(res, await this.network.configureIssuer(Boolean(bodyOf(req, ConfigureIssuerBody).clawback)));
    });

    /** Reconciles one holder's on-chain authorization with their KYC status. */
    r.post('/api/admin/compliance/sync', admin, this.limits.heavyAdmin, body(ComplianceSyncBody), async (req, res) => {
      const b = bodyOf(req, ComplianceSyncBody);
      ok(res, await this.compliance.sync(b.address, b.approved));
    });
  }
}
