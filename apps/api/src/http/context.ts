import type { Account } from '../domain/account/Account';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Account resolved from a valid Bearer token (set by `AuthMiddleware.attach`). */
      account?: Account;
      /** Raw session token, for logout. */
      authToken?: string;
      requestId?: string;
    }
  }
}

export {};
