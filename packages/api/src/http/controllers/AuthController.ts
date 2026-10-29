import type { Request, RequestHandler, Response, Router } from 'express';
import type { LoginPayload } from '@fractachain/shared';
import type { AccountService } from '../../application/account/AccountService';
import type { WalletService } from '../../application/account/WalletService';
import type { AuthService } from '../../application/auth/AuthService';
import type { EmailVerificationService } from '../../application/security/EmailVerificationService';
import type { PasswordResetService } from '../../application/security/PasswordResetService';
import type { TwoFactorService } from '../../application/security/TwoFactorService';
import { AppError, UnauthenticatedError } from '../../shared/errors';
import type { AuditMiddleware } from '../middleware/AuditMiddleware';
import { bodyField } from '../middleware/AuditMiddleware';
import { currentAccount, type AuthMiddleware } from '../middleware/AuthMiddleware';
import type { RateLimiters } from '../middleware/rateLimiters';
import { body, bodyOf } from '../middleware/validate';
import { noStore, ok } from '../respond';
import {
  CodeBody,
  CustodyBody,
  EmailLoginBody,
  FirebaseLoginBody,
  ForgotPasswordBody,
  ResetPasswordBody,
  TokenBody,
  TwoFactorVerifyBody,
  WalletSignatureBody,
} from '../schemas';
import type { SessionCookie } from '../SessionCookie';
import type { Controller } from './Controller';

export class AuthController implements Controller {
  constructor(
    private readonly auth: AuthService,
    private readonly accounts: AccountService,
    private readonly wallets: WalletService,
    private readonly twoFactor: TwoFactorService,
    private readonly emails: EmailVerificationService,
    private readonly passwords: PasswordResetService,
    private readonly cookie: SessionCookie,
    private readonly guard: AuthMiddleware,
    private readonly limits: RateLimiters,
    private readonly audit: AuditMiddleware,
  ) {}

  /** Sends a login result: the session also goes into the HttpOnly cookie. */
  private respondLogin(req: Request, res: Response, payload: LoginPayload): void {
    noStore(res);
    if ('token' in payload) {
      this.cookie.set(res, payload.token, payload.expiresAt);
      // Lets the audit entry name the account that just signed in.
      req.account = this.accounts.get(payload.user.id);
    }
    res.json(payload);
  }

  register(r: Router): void {
    const auth = this.guard.requireAuth;

    r.post(
      '/api/auth/email',
      this.limits.auth,
      this.audit.route('auth.login.email', bodyField('email')),
      body(EmailLoginBody),
      async (req, res) => {
        this.respondLogin(req, res, await this.auth.loginWithEmail(bodyOf(req, EmailLoginBody)));
      },
    );

    r.post(
      '/api/auth/firebase',
      this.limits.auth,
      this.audit.route('auth.login.google'),
      body(FirebaseLoginBody),
      async (req, res) => {
        this.respondLogin(req, res, await this.auth.loginWithFirebase(bodyOf(req, FirebaseLoginBody)));
      },
    );

    r.post(
      '/api/auth/freighter',
      this.limits.auth,
      this.audit.route('auth.login.wallet', bodyField('publicKey')),
      body(WalletSignatureBody),
      async (req, res) => {
        this.respondLogin(req, res, await this.auth.loginWithWallet(bodyOf(req, WalletSignatureBody)));
      },
    );

    // v1 mock that minted sessions for any email without verification.
    r.post('/api/auth/google', (_req, _res) => {
      throw new AppError(
        'El ingreso con Google usa Firebase: POST /api/auth/firebase con el idToken.',
        410,
        'BAD_REQUEST',
      );
    });

    const me: RequestHandler = (req, res) => {
      if (!req.account) throw new UnauthenticatedError('No autenticado');
      noStore(res).json({ success: true, user: this.accounts.toPublic(req.account) });
    };
    r.get('/api/auth/me', me);
    r.get('/api/auth/firebase/me', me);

    r.post('/api/auth/logout', this.audit.route('auth.logout'), (req, res) => {
      const revoked = this.auth.logout(req.authToken);
      this.cookie.clear(res);
      res.json({ success: true, revoked, message: 'Sesión finalizada con éxito' });
    });

    r.post(
      '/api/auth/sessions/revoke-all',
      auth,
      this.audit.route('auth.sessions.revoke_all'),
      (req, res) => {
        this.auth.revokeAllSessions(currentAccount(req).id);
        this.cookie.clear(res);
        res.json({ success: true });
      },
    );

    /* ------------------------------- 2FA ------------------------------- */
    r.post('/api/auth/2fa/setup', auth, (req, res) => {
      noStore(res);
      ok(res, this.twoFactor.setup(currentAccount(req).id));
    });

    r.post(
      '/api/auth/2fa/enable',
      auth,
      this.limits.auth,
      this.audit.route('auth.2fa.enable'),
      body(CodeBody),
      (req, res) => {
        noStore(res);
        ok(res, this.twoFactor.enable(currentAccount(req).id, bodyOf(req, CodeBody).code));
      },
    );

    r.post(
      '/api/auth/2fa/disable',
      auth,
      this.limits.auth,
      this.audit.route('auth.2fa.disable'),
      body(CodeBody),
      (req, res) => {
        ok(res, { user: this.twoFactor.disable(currentAccount(req).id, bodyOf(req, CodeBody).code) });
      },
    );

    r.post(
      '/api/auth/2fa/verify',
      this.limits.auth,
      this.audit.route('auth.login.2fa'),
      body(TwoFactorVerifyBody),
      (req, res) => {
        const b = bodyOf(req, TwoFactorVerifyBody);
        this.respondLogin(req, res, this.auth.verifyTwoFactor(b.challenge, b.code));
      },
    );

    /* ------------------------- email verification ------------------------- */
    r.post(
      '/api/auth/email/verify',
      this.limits.auth,
      this.audit.route('auth.email.verify'),
      body(TokenBody),
      (req, res) => {
        ok(res, { user: this.emails.verify(bodyOf(req, TokenBody).token) });
      },
    );

    r.post('/api/auth/email/resend', auth, this.limits.auth, async (req, res) => {
      await this.emails.resend(currentAccount(req).id);
      res.json({ success: true });
    });

    /* ---------------------------- password reset ---------------------------- */
    r.post(
      '/api/auth/password/forgot',
      this.limits.auth,
      this.audit.route('auth.password.forgot', bodyField('email')),
      body(ForgotPasswordBody),
      async (req, res) => {
        await this.passwords.request(bodyOf(req, ForgotPasswordBody).email);
        res.json({ success: true });
      },
    );

    r.post(
      '/api/auth/password/reset',
      this.limits.auth,
      this.audit.route('auth.password.reset'),
      body(ResetPasswordBody),
      async (req, res) => {
        const b = bodyOf(req, ResetPasswordBody);
        const accountId = await this.passwords.reset(b.token, b.password);
        this.respondLogin(req, res, this.auth.sessionFor(accountId));
      },
    );

    /* ------------------------------- wallet ------------------------------- */
    r.post('/api/auth/wallet', auth, this.limits.faucet, body(CustodyBody), async (req, res) => {
      const { mode, publicKey } = bodyOf(req, CustodyBody);
      const result = await this.wallets.chooseCustody(currentAccount(req).id, mode, publicKey);
      noStore(res).json(result);
    });

    r.get(
      '/api/auth/wallet/secret',
      auth,
      this.limits.secretExport,
      this.audit.route('wallet.secret.export'),
      (req, res) => {
        const secret = this.wallets.exportSecret(currentAccount(req).id);
        noStore(res).json({ success: true, secret });
      },
    );

    r.post(
      '/api/auth/wallet/link',
      auth,
      this.limits.auth,
      this.audit.route('auth.wallet.link', bodyField('publicKey')),
      body(WalletSignatureBody),
      async (req, res) => {
        res.json(await this.auth.linkWallet(currentAccount(req).id, bodyOf(req, WalletSignatureBody)));
      },
    );
  }
}
