import type { ITokenProvider, IUnauthorizedHandler } from '../http/HttpClient';
import { Store } from '../store/Store';
import type { SessionUser } from './SessionUser';
import type { ITokenStorage } from './TokenStorage';

export interface SessionState {
  user: SessionUser | null;
  token: string | null;
  expiresAt: string | null;
  /** True until the persisted session has been read (and while a login is in flight). */
  isLoading: boolean;
  /** Self-custody secret shown exactly once after the wallet is generated. */
  revealedSecret: string | null;
}

/** What islands render on the server and during hydration: nobody is known yet. */
export const SERVER_SESSION: SessionState = Object.freeze({
  user: null,
  token: null,
  expiresAt: null,
  isLoading: true,
  revealedSecret: null,
});

/** Longest delay `setTimeout` accepts (~24.8 days). */
const MAX_TIMER_MS = 2_147_483_647;

/**
 * Single source of truth for "who is signed in", shared by every island.
 *
 * Implements {@link ITokenProvider} so the HTTP client reads the token from
 * here, and {@link IUnauthorizedHandler} so a 401 anywhere ends the session.
 */
export class SessionStore extends Store<SessionState> implements ITokenProvider, IUnauthorizedHandler {
  private expiryTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly storage: ITokenStorage,
    private readonly now: () => number = () => Date.now(),
  ) {
    super({ ...SERVER_SESSION });
  }

  /** Reads the persisted session once; expired sessions are discarded on the spot. */
  hydrate(): void {
    const saved = this.storage.load();
    if (saved && !this.isPast(saved.expiresAt)) {
      this.setState({ token: saved.token, user: saved.user, expiresAt: saved.expiresAt, isLoading: false });
      this.scheduleExpiry(saved.expiresAt);
    } else {
      if (saved) this.storage.clear();
      this.setState({ isLoading: false });
    }
  }

  getToken(): string | null {
    const { token, expiresAt } = this.getSnapshot();
    if (!token) return null;
    if (this.isPast(expiresAt)) {
      this.clear();
      return null;
    }
    return token;
  }

  setSession(token: string, user: SessionUser, expiresAt: string | null = null): void {
    this.storage.save({ token, user, expiresAt });
    this.setState({ token, user, expiresAt, isLoading: false });
    this.scheduleExpiry(expiresAt);
  }

  /** Replaces the user while keeping the current token. */
  updateUser(user: SessionUser): void {
    const { token, expiresAt } = this.getSnapshot();
    if (!token) return;
    this.storage.save({ token, user, expiresAt });
    this.setState({ user });
  }

  setLoading(isLoading: boolean): void {
    this.setState({ isLoading });
  }

  setRevealedSecret(secret: string | null): void {
    this.setState({ revealedSecret: secret });
  }

  clear(): void {
    if (this.expiryTimer) clearTimeout(this.expiryTimer);
    this.expiryTimer = null;
    this.storage.clear();
    this.setState({ user: null, token: null, expiresAt: null, isLoading: false, revealedSecret: null });
  }

  onUnauthorized(): void {
    this.clear();
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
