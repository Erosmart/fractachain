import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { Account } from '../../domain/account/Account';
import { ForbiddenError, UnauthenticatedError } from '../../shared/errors';
import type { AuthService } from '../../application/auth/AuthService';
import type { AccountService } from '../../application/account/AccountService';

/** Extracts the token from `Authorization: Bearer <token>`. */
export function bearerToken(req: Request): string | undefined {
  const header = req.headers.authorization;
  if (!header) return undefined;
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match?.[1];
}

/**
 * Session guards. `attach` runs on every request and resolves the account
 * when a valid token is present; `requireAuth` / `requireAdmin` enforce it
 * per route, so authorization is declared next to each endpoint.
 */
export class AuthMiddleware {
  constructor(
    private readonly auth: AuthService,
    private readonly accounts: AccountService,
  ) {}

  readonly attach: RequestHandler = (req: Request, _res: Response, next: NextFunction) => {
    const token = bearerToken(req);
    if (token) {
      req.authToken = token;
      req.account = this.auth.authenticate(token);
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
    next();
  };
}

/** The authenticated account; only call behind `requireAuth`. */
export function currentAccount(req: Request): Account {
  if (!req.account) throw new UnauthenticatedError();
  return req.account;
}
