import type { Account } from '../domain/account/Account';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Account resolved from a valid Bearer token (set by `AuthMiddleware.attach`). */
      account?: Account;
      /** Raw session token, for logout. */
      authToken?: string;
      /** Where the token came from: CSRF checks only apply to the cookie. */
      authVia?: 'bearer' | 'cookie';
      requestId?: string;
    }
  }
}

export {};
