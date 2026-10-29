import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { hasTwoFactor, type Account } from '../../domain/account/Account';
import { ForbiddenError, UnauthenticatedError } from '../../shared/errors';
import type { AuthService } from '../../application/auth/AuthService';
import type { AccountService } from '../../application/account/AccountService';
import type { SessionCookie } from '../SessionCookie';

/** Extracts the token from `Authorization: Bearer <token>`. */
export function bearerToken(req: Request): string | undefined {
  const header = req.headers.authorization;
  if (!header) return undefined;
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match?.[1];
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
/** Header the web app sends on every API call; a cross-site form or image cannot. */
export const CSRF_HEADER = 'x-requested-with';
export const CSRF_HEADER_VALUE = 'fractachain';

export interface AuthMiddlewareOptions {
  /** Admin routes refuse admins without TOTP. */
  adminRequire2fa: boolean;
}

/**
 * Session guards. `attach` resolves the account from a Bearer token or the
 * session cookie on every request; `requireAuth` / `requireAdmin` enforce it
 * per route, so authorization is declared next to each endpoint.
 */
export class AuthMiddleware {
  constructor(
    private readonly auth: AuthService,
    private readonly accounts: AccountService,
    private readonly cookie: SessionCookie,
    private readonly options: AuthMiddlewareOptions,
  ) {}

  readonly attach: RequestHandler = (req: Request, _res: Response, next: NextFunction) => {
    const bearer = bearerToken(req);
    const token = bearer ?? this.cookie.read(req);
    if (token) {
      req.authToken = token;
      req.authVia = bearer ? 'bearer' : 'cookie';
      req.account = this.auth.authenticate(token);
    }
    next();
  };

  /**
   * CSRF guard for cookie sessions: a state-changing request that carries the
   * session cookie must also carry the custom header (which a cross-site page
   * cannot add without a CORS preflight we never grant) and, when the browser
   * sends `Origin`, come from this same host. Bearer requests are exempt: the
   * browser never attaches those on its own.
   */
  readonly csrf: RequestHandler = (req, _res, next) => {
    if (SAFE_METHODS.has(req.method) || req.authVia === 'bearer' || !this.cookie.read(req)) return next();
    const marker = String(req.headers[CSRF_HEADER] ?? '').toLowerCase();
    const origin = req.headers.origin;
    const sameOrigin = !origin || AuthMiddleware.originMatchesHost(origin, req);
    if (marker !== CSRF_HEADER_VALUE || !sameOrigin) {
      return next(new ForbiddenError('Solicitud rechazada (protección CSRF). Recargá la página.', 'CSRF'));
    }
    next();
  };

  readonly requireAuth: RequestHandler = (req, _res, next) => {
    if (!req.account) return next(new UnauthenticatedError('Iniciá sesión'));
    next();
  };

  readonly requireAdmin: RequestHandler = (req, _res, next) => {
    if (!req.account) return next(new UnauthenticatedError('Iniciá sesión'));
    if (!this.accounts.isAdmin(req.account)) return next(new ForbiddenError('Solo el admin puede hacer esto'));
    if (this.options.adminRequire2fa && !hasTwoFactor(req.account)) {
      return next(
        new ForbiddenError('Activá la verificación en dos pasos (Cuenta → Seguridad) para usar el panel de admin.', 'TWO_FACTOR_REQUIRED'),
      );
    }
    next();
  };

  private static originMatchesHost(origin: string, req: Request): boolean {
    try {
      const host = req.headers['x-forwarded-host'] ?? req.headers.host;
      return new URL(origin).host === String(Array.isArray(host) ? host[0] : host);
    } catch {
      return false;
    }
  }
}

/** The authenticated account; only call behind `requireAuth`. */
export function currentAccount(req: Request): Account {
  if (!req.account) throw new UnauthenticatedError();
  return req.account;
}
