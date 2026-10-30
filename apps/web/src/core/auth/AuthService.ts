import type { AuthApi } from '../api/AuthApi';
import { isTwoFactorChallenge, type LoginResponse, type SessionResponse } from '../api/types';
import type { IGoogleAuthProvider } from '../firebase/FirebaseAuthProvider';
import type { UsdcFundingService } from '../wallet/UsdcFundingService';
import type { IWalletSigner } from '../wallet/WalletSigner';
import type { SessionStore, TwoFactorChallenge } from './SessionStore';
import { normalizeUser, type SessionUser } from './SessionUser';

/** Outcome of a login attempt: signed in, or waiting for the second factor. */
export type LoginResult =
  { status: 'signed-in'; user: SessionUser } | { status: 'two-factor'; challenge: TwoFactorChallenge };

/** What to do once the session exists (the USDC trustline step depends on the entry point). */
type AfterLogin = 'fund-if-wallet' | 'fund' | 'none';

/**
 * Sign-in / sign-out use cases. Owns no state: it orchestrates the API, the
 * wallet and the Google provider, and writes the outcome to the session store.
 *
 * The credential is the HttpOnly cookie the API sets; nothing here ever
 * handles a token. When an account has 2FA, every entry point stops at a
 * challenge kept in the store, and {@link completeTwoFactor} finishes it.
 */
export class AuthService {
  private bootstrapped = false;
  private afterTwoFactor: AfterLogin = 'none';

  constructor(
    private readonly api: AuthApi,
    private readonly session: SessionStore,
    private readonly signer: IWalletSigner,
    private readonly google: IGoogleAuthProvider,
    private readonly usdc: UsdcFundingService,
  ) {}

  /** Re-validates a cached session once per page load. Idempotent. */
  readonly bootstrap = (): void => {
    if (this.bootstrapped || typeof window === 'undefined') return;
    this.bootstrapped = true;
    if (this.session.getSnapshot().user) void this.refresh();
  };

  readonly loginWithEmail = (email: string, password: string, name?: string): Promise<LoginResult> =>
    // Wallets already set up: custodial ones are funded server-side without a
    // popup; self-custody signs the USDC trustline once if it is missing.
    this.withLoading(async () =>
      this.conclude(await this.api.loginWithEmail(email, password, name), 'fund-if-wallet'),
    );

  /** Email sign-up with explicit acceptance of the current terms; signs the new account in. */
  readonly register = (input: { name: string; email: string; password: string; termsVersion: string }) =>
    this.withLoading(async () =>
      this.conclude(
        await this.api.register({
          name: input.name.trim(),
          email: input.email.trim(),
          password: input.password,
          acceptTerms: true,
          termsVersion: input.termsVersion,
        }),
        'none',
      ),
    );

  /** Accepts the current terms (wallet / Google sign-ups, or after a new version). */
  readonly acceptTerms = async (version: string): Promise<SessionUser | null> => {
    const raw = await this.api.acceptTerms(version);
    if (raw && typeof raw === 'object') {
      const user = normalizeUser(raw);
      this.session.updateUser(user);
      this.session.dismissNotice();
      return user;
    }
    await this.refresh();
    this.session.dismissNotice();
    return this.session.getSnapshot().user;
  };

  readonly loginWithWallet = (): Promise<LoginResult> =>
    // One more Freighter signature inside the login opens the USDC trustline
    // and triggers the grant; without it the wallet cannot receive USDC.
    this.withLoading(async () =>
      this.conclude(await this.api.loginWithFreighter(await this.signer.signLoginChallenge()), 'fund'),
    );

  readonly loginWithGoogle = (): Promise<LoginResult> =>
    this.withLoading(async () =>
      this.conclude(await this.api.loginWithFirebase(await this.google.signIn()), 'none'),
    );

  /** Sets a new password from an emailed link; the API signs the user in (or asks for 2FA). */
  readonly resetPassword = (token: string, password: string): Promise<LoginResult> =>
    this.withLoading(async () =>
      this.conclude(await this.api.resetPassword(token, password), 'fund-if-wallet'),
    );

  /** Second step of a login with the TOTP (or recovery) code. */
  readonly completeTwoFactor = (code: string): Promise<SessionUser> =>
    this.withLoading(async () => {
      const pending = this.session.getSnapshot().pendingTwoFactor;
      if (!pending) throw new Error('two-factor challenge missing');
      const user = this.apply(await this.api.verifyTwoFactor(pending.challenge, code.replace(/\s+/g, '')));
      await this.runAfterLogin(user, this.afterTwoFactor);
      return user;
    });

  readonly cancelTwoFactor = (): void => {
    this.session.setPendingTwoFactor(null);
  };

  /** Revokes the session server-side (best effort) and always clears the local one. */
  readonly logout = (): void => {
    void this.api.logout().catch(() => undefined);
    void this.google.signOut();
    this.session.clear();
  };

  /** Pulls the latest user; a 401 already cleared the session via the HTTP client. */
  readonly refresh = async (): Promise<void> => {
    if (!this.session.getSnapshot().user) return;
    try {
      this.session.updateUser(normalizeUser(await this.api.me()));
    } catch {
      // offline or transient: keep the cached copy until the next refresh
    }
  };

  private async conclude(response: LoginResponse, after: AfterLogin): Promise<LoginResult> {
    if (isTwoFactorChallenge(response)) {
      const challenge: TwoFactorChallenge = {
        challenge: response.challenge,
        expiresAt: response.expiresAt ?? null,
      };
      this.afterTwoFactor = after;
      this.session.setPendingTwoFactor(challenge);
      return { status: 'two-factor', challenge };
    }
    const user = this.apply(response);
    await this.runAfterLogin(user, after);
    return { status: 'signed-in', user };
  }

  private async runAfterLogin(user: SessionUser, after: AfterLogin): Promise<void> {
    const wantsFunding =
      after === 'fund' || (after === 'fund-if-wallet' && Boolean(user.publicKey && user.custodyMode));
    if (wantsFunding) await this.usdc.ensureReady().catch(() => undefined);
  }

  private apply(response: SessionResponse): SessionUser {
    const user = normalizeUser(response.user);
    this.session.setSession(user, response.expiresAt ?? null);
    return user;
  }

  private async withLoading<T>(work: () => Promise<T>): Promise<T> {
    this.session.setLoading(true);
    try {
      return await work();
    } finally {
      this.session.setLoading(false);
    }
  }
}
