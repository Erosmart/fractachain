import type { IPolicyViolationHandler, IUnauthorizedHandler, PolicyViolationCode } from '../http/HttpClient';
import { Store } from '../store/Store';
import type { ISessionCache } from './SessionCache';
import type { SessionUser } from './SessionUser';

/** A login that still needs the second factor (TOTP or recovery code). */
export interface TwoFactorChallenge {
  challenge: string;
  /** When the challenge stops being accepted (ISO), if the API said. */
  expiresAt: string | null;
}

/** Account-level refusal the API reported (e.g. admin route without 2FA). */
export interface SecurityNotice {
  code: PolicyViolationCode;
  message: string;
}

export interface SessionState {
  user: SessionUser | null;
  expiresAt: string | null;
  /** True until the cached session has been read (and while a login is in flight). */
  isLoading: boolean;
  /** Self-custody secret shown exactly once after the wallet is generated. */
  revealedSecret: string | null;
  /** Password/wallet/Google step passed; waiting for the second factor. */
  pendingTwoFactor: TwoFactorChallenge | null;
  notice: SecurityNotice | null;
}

/** What islands render on the server and during hydration: nobody is known yet. */
export const SERVER_SESSION: SessionState = Object.freeze({
  user: null,
  expiresAt: null,
  isLoading: true,
  revealedSecret: null,
  pendingTwoFactor: null,
  notice: null,
});

/** Longest delay `setTimeout` accepts (~24.8 days). */
const MAX_TIMER_MS = 2_147_483_647;

/**
 * Single source of truth for "who is signed in", shared by every island.
 *
 * The credential is the HttpOnly session cookie; this store only holds the
 * user the API returned. It implements {@link IUnauthorizedHandler} so a 401
 * anywhere ends the session, and {@link IPolicyViolationHandler} so account
 * refusals (2FA required, email not verified) surface once, app-wide.
 */
export class SessionStore
  extends Store<SessionState>
  implements IUnauthorizedHandler, IPolicyViolationHandler
{
  private expiryTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly cache: ISessionCache,
    private readonly now: () => number = () => Date.now(),
  ) {
    super({ ...SERVER_SESSION });
  }

  /** Reads the cached session once; expired sessions are discarded on the spot. */
  hydrate(): void {
    const saved = this.cache.load();
    if (saved && !this.isPast(saved.expiresAt)) {
      this.setState({ user: saved.user, expiresAt: saved.expiresAt, isLoading: false });
      this.scheduleExpiry(saved.expiresAt);
    } else {
      if (saved) this.cache.clear();
      this.setState({ isLoading: false });
    }
  }

  /** A user is known and their session has not expired. */
  isAuthenticated(): boolean {
    const { user, expiresAt } = this.getSnapshot();
    if (!user) return false;
    if (this.isPast(expiresAt)) {
      this.clear();
      return false;
    }
    return true;
  }

  setSession(user: SessionUser, expiresAt: string | null = null): void {
    this.cache.save({ user, expiresAt });
    this.setState({ user, expiresAt, isLoading: false, pendingTwoFactor: null, notice: null });
    this.scheduleExpiry(expiresAt);
  }

  /** Replaces the user of the current session (no-op when signed out). */
  updateUser(user: SessionUser): void {
    const { user: current, expiresAt } = this.getSnapshot();
    if (!current) return;
    this.cache.save({ user, expiresAt });
    this.setState({ user });
  }

  setLoading(isLoading: boolean): void {
    this.setState({ isLoading });
  }

  setRevealedSecret(secret: string | null): void {
    this.setState({ revealedSecret: secret });
  }

  setPendingTwoFactor(pendingTwoFactor: TwoFactorChallenge | null): void {
    this.setState({ pendingTwoFactor });
  }

  dismissNotice(): void {
    this.setState({ notice: null });
  }

  clear(): void {
    if (this.expiryTimer) clearTimeout(this.expiryTimer);
    this.expiryTimer = null;
    this.cache.clear();
    this.setState({
      user: null,
      expiresAt: null,
      isLoading: false,
      revealedSecret: null,
      pendingTwoFactor: null,
      notice: null,
    });
  }

  onUnauthorized(): void {
    if (this.getSnapshot().user) this.clear();
    else this.setState({ isLoading: false });
  }

  onPolicyViolation(code: PolicyViolationCode, message: string): void {
    this.setState({ notice: { code, message } });
  }

  private isPast(expiresAt: string | null): boolean {
    if (!expiresAt) return false;
    const at = Date.parse(expiresAt);
    return Number.isFinite(at) && at <= this.now();
  }

  private scheduleExpiry(expiresAt: string | null): void {
    if (this.expiryTimer) clearTimeout(this.expiryTimer);
    this.expiryTimer = null;
    if (!expiresAt || typeof window === 'undefined') return;
    const delay = Date.parse(expiresAt) - this.now();
    if (!Number.isFinite(delay)) return;
    this.expiryTimer = setTimeout(() => this.clear(), Math.max(0, Math.min(delay, MAX_TIMER_MS)));
  }
}
