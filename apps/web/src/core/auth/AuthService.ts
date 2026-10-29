import type { AuthApi } from '../api/AuthApi';
import type { SessionResponse } from '../api/types';
import type { IGoogleAuthProvider } from '../firebase/FirebaseAuthProvider';
import type { UsdcFundingService } from '../wallet/UsdcFundingService';
import type { IWalletSigner } from '../wallet/WalletSigner';
import type { SessionStore } from './SessionStore';
import { normalizeUser, type SessionUser } from './SessionUser';

/**
 * Sign-in / sign-out use cases. Owns no state: it orchestrates the API, the
 * wallet and the Google provider, and writes the outcome to the session store.
 */
export class AuthService {
  private bootstrapped = false;

  constructor(
    private readonly api: AuthApi,
    private readonly session: SessionStore,
    private readonly signer: IWalletSigner,
    private readonly google: IGoogleAuthProvider,
    private readonly usdc: UsdcFundingService,
  ) {}

  /** Re-validates a persisted session once per page load. Idempotent. */
  readonly bootstrap = (): void => {
    if (this.bootstrapped || typeof window === 'undefined') return;
    this.bootstrapped = true;
    if (this.session.getToken()) void this.refresh();
  };

  readonly loginWithEmail = (email: string, password: string, name?: string): Promise<SessionUser> =>
    this.withLoading(async () => {
      const user = this.apply(await this.api.loginWithEmail(email, password, name));
      // Wallets already set up: custodial ones are funded server-side without a
      // popup; self-custody signs the USDC trustline once if it is missing.
      if (user.publicKey && user.custodyMode) await this.usdc.ensureReady().catch(() => undefined);
      return user;
    });

  readonly loginWithWallet = (): Promise<SessionUser> =>
    this.withLoading(async () => {
      const payload = await this.signer.signLoginChallenge();
      const user = this.apply(await this.api.loginWithFreighter(payload));
      // One more Freighter signature inside the login opens the USDC trustline
      // and triggers the grant; without it the wallet cannot receive USDC.
      await this.usdc.ensureReady().catch(() => undefined);
      return user;
    });

  readonly loginWithGoogle = (): Promise<SessionUser> =>
    this.withLoading(async () => this.apply(await this.api.loginWithFirebase(await this.google.signIn())));

  /** Revokes the token server-side (best effort) and always clears the local session. */
  readonly logout = (): void => {
    const token = this.session.getSnapshot().token;
    if (token) void this.api.logout(token).catch(() => undefined);
    void this.google.signOut();
    this.session.clear();
  };

  /** Pulls the latest user; a 401 already cleared the session via the HTTP client. */
  readonly refresh = async (): Promise<void> => {
    const token = this.session.getToken();
    if (!token) return;
    try {
      this.session.updateUser(normalizeUser(await this.api.me(token)));
    } catch {
      // offline or transient: keep the local copy until the next refresh
    }
  };

  private apply(response: SessionResponse): SessionUser {
    const user = normalizeUser(response.user);
    this.session.setSession(response.token, user, response.expiresAt ?? null);
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
