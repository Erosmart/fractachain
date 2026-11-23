import type { Router } from 'express';
import type { AuditTrail } from '../../application/audit/AuditTrail';
import type { ComplianceService } from '../../application/compliance/ComplianceService';
import type { NetworkAdminService } from '../../application/testnet/NetworkAdminService';
import type { AuditMiddleware } from '../middleware/AuditMiddleware';
import type { AuthMiddleware } from '../middleware/AuthMiddleware';
import type { RateLimiters } from '../middleware/rateLimiters';
import { ValidationError } from '../../shared/errors';
import { body, bodyOf } from '../middleware/validate';
import { noStore, ok } from '../respond';
import { AuditQuery, ComplianceSyncBody, ConfigureIssuerBody, NetworkSettingsBody } from '../schemas';
import type { Controller } from './Controller';

/** Admin → Testnet and compliance reconciliation. */
export class AdminOpsController implements Controller {
  constructor(
    private readonly network: NetworkAdminService,
    private readonly compliance: ComplianceService,
    private readonly guard: AuthMiddleware,
    private readonly limits: RateLimiters,
    private readonly audit: AuditMiddleware,
    private readonly trail: AuditTrail,
  ) {}

  register(r: Router): void {
    const admin = this.guard.requireAdmin;

    r.get('/api/admin/testnet', admin, async (_req, res) => {
      ok(res, await this.network.overview());
    });

    r.post(
      '/api/admin/testnet',
      admin,
      this.audit.route('testnet.settings'),
      body(NetworkSettingsBody),
      (req, res) => {
        ok(res, this.network.update(bodyOf(req, NetworkSettingsBody)));
      },
    );

    r.post(
      '/api/admin/testnet/configure-issuer',
      admin,
      this.limits.heavyAdmin,
      this.audit.route('testnet.configure_issuer'),
      body(ConfigureIssuerBody),
      async (req, res) => {
        ok(res, await this.network.configureIssuer(Boolean(bodyOf(req, ConfigureIssuerBody).clawback)));
      },
    );

    /** Security audit trail, newest first. */
    r.get('/api/admin/audit', admin, (req, res) => {
      const query = AuditQuery.safeParse(req.query);
      if (!query.success) throw new ValidationError('Filtros inválidos');
      noStore(res);
      ok(res, this.trail.query(query.data));
    });

    /** Reconciles one holder's on-chain authorization with their KYC status. */
    r.post(
      '/api/admin/compliance/sync',
      admin,
      this.limits.heavyAdmin,
      this.audit.route('compliance.sync'),
      body(ComplianceSyncBody),
      async (req, res) => {
        const b = bodyOf(req, ComplianceSyncBody);
        ok(res, await this.compliance.sync(b.address, b.approved));
      },
    );
  }
}
