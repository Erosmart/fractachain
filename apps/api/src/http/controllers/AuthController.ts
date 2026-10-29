import type { RequestHandler, Router } from 'express';
import type { AccountService } from '../../application/account/AccountService';
import type { WalletService } from '../../application/account/WalletService';
import type { AuthService } from '../../application/auth/AuthService';
import { AppError, UnauthenticatedError } from '../../shared/errors';
import { currentAccount, type AuthMiddleware } from '../middleware/AuthMiddleware';
import type { RateLimiters } from '../middleware/rateLimiters';
import { body, bodyOf } from '../middleware/validate';
import { noStore } from '../respond';
import { CustodyBody, EmailLoginBody, FirebaseLoginBody, WalletSignatureBody } from '../schemas';
import type { Controller } from './Controller';

export class AuthController implements Controller {
  constructor(
    private readonly auth: AuthService,
    private readonly accounts: AccountService,
    private readonly wallets: WalletService,
    private readonly guard: AuthMiddleware,
    private readonly limits: RateLimiters,
  ) {}

  register(r: Router): void {
    r.post('/api/auth/email', this.limits.auth, body(EmailLoginBody), async (req, res) => {
      res.json(await this.auth.loginWithEmail(bodyOf(req, EmailLoginBody)));
    });

    r.post('/api/auth/firebase', this.limits.auth, body(FirebaseLoginBody), async (req, res) => {
      res.json(await this.auth.loginWithFirebase(bodyOf(req, FirebaseLoginBody)));
    });

    r.post('/api/auth/freighter', this.limits.auth, body(WalletSignatureBody), async (req, res) => {
      res.json(await this.auth.loginWithWallet(bodyOf(req, WalletSignatureBody)));
    });

    // v1 mock that minted sessions for any email without verification.
    r.post('/api/auth/google', (_req, _res) => {
      throw new AppError('El ingreso con Google usa Firebase: POST /api/auth/firebase con el idToken.', 410, 'BAD_REQUEST');
    });

    const me: RequestHandler = (req, res) => {
      if (!req.account) throw new UnauthenticatedError('No autenticado');
      noStore(res).json({ success: true, user: this.accounts.toPublic(req.account) });
    };
    r.get('/api/auth/me', me);
    r.get('/api/auth/firebase/me', me);

    r.post('/api/auth/logout', (req, res) => {
      const revoked = this.auth.logout(req.authToken);
      res.json({ success: true, revoked, message: 'Sesión finalizada con éxito' });
    });

    r.post('/api/auth/wallet', this.guard.requireAuth, this.limits.faucet, body(CustodyBody), async (req, res) => {
      const { mode, publicKey } = bodyOf(req, CustodyBody);
      const result = await this.wallets.chooseCustody(currentAccount(req).id, mode, publicKey);
      noStore(res).json(result);
    });

    r.get('/api/auth/wallet/secret', this.guard.requireAuth, this.limits.secretExport, (req, res) => {
      const secret = this.wallets.exportSecret(currentAccount(req).id);
      noStore(res).json({ success: true, secret });
    });

    r.post('/api/auth/wallet/link', this.guard.requireAuth, this.limits.auth, body(WalletSignatureBody), async (req, res) => {
      res.json(await this.auth.linkWallet(currentAccount(req).id, bodyOf(req, WalletSignatureBody)));
    });
  }
}
