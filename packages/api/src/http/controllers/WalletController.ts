import type { Router } from 'express';
import type { WalletService } from '../../application/account/WalletService';
import { ValidationError } from '../../shared/errors';
import { currentAccount, type AuthMiddleware } from '../middleware/AuthMiddleware';
import type { RateLimiters } from '../middleware/rateLimiters';
import { body, bodyOf } from '../middleware/validate';
import { ok } from '../respond';
import { WalletStateQuery, XdrBody } from '../schemas';
import type { Controller } from './Controller';

export class WalletController implements Controller {
  constructor(
    private readonly wallets: WalletService,
    private readonly guard: AuthMiddleware,
    private readonly limits: RateLimiters,
  ) {}

  register(r: Router): void {
    /** XLM + platform USDC balances. Provisioning side effects only for the caller's own wallet. */
    r.get('/api/wallet/state', async (req, res) => {
      const query = WalletStateQuery.safeParse(req.query);
      if (!query.success) throw new ValidationError('Parámetro account inválido');
      const publicKey = query.data.account || req.account?.publicKey || '';
      if (!publicKey) throw new ValidationError('Falta account');
      ok(res, await this.wallets.state(publicKey, req.account));
    });

    /** "Friendbot de USDC": custodial funded inline, self-custody gets a changeTrust XDR to sign. */
    r.post('/api/wallet/usdc/fund', this.guard.requireAuth, this.limits.faucet, async (req, res) => {
      ok(res, await this.wallets.fundUsdc(currentAccount(req).id));
    });

    r.post(
      '/api/wallet/usdc/submit',
      this.guard.requireAuth,
      this.limits.faucet,
      body(XdrBody),
      async (req, res) => {
        ok(res, await this.wallets.submitUsdcTrustline(currentAccount(req).id, bodyOf(req, XdrBody).xdr));
      },
    );
  }
}
