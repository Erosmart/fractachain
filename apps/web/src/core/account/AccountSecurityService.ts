import type { AuthApi } from '../api/AuthApi';
import type { TwoFactorSetup } from '../api/types';
import type { SessionStore } from '../auth/SessionStore';
import { normalizeUser, type SessionUser } from '../auth/SessionUser';

/**
 * Account security use cases that do not create a session: TOTP enrollment,
 * email verification, password-reset requests and "sign out everywhere".
 * (Logins — including the one a password reset ends with — live in AuthService.)
 */
export class AccountSecurityService {
  constructor(
    private readonly api: AuthApi,
    private readonly session: SessionStore,
  ) {}

  /** Starts TOTP enrollment; nothing changes until {@link enableTwoFactor} confirms a code. */
  readonly startTwoFactorSetup = (): Promise<TwoFactorSetup> => this.api.setupTwoFactor();

  /** Confirms the authenticator works; returns the one-time recovery codes. */
  readonly enableTwoFactor = async (code: string): Promise<string[]> => {
    const result = await this.api.enableTwoFactor(AccountSecurityService.cleanCode(code));
    this.updateUser(result.user);
    return Array.isArray(result.recoveryCodes)
      ? result.recoveryCodes.filter((c) => typeof c === 'string')
      : [];
  };

  readonly disableTwoFactor = async (code: string): Promise<void> => {
    const result = await this.api.disableTwoFactor(AccountSecurityService.cleanCode(code));
    this.updateUser(result.user);
  };

  /** Ends every session of the account; this tab is signed out too. */
  readonly revokeAllSessions = async (): Promise<void> => {
    await this.api.revokeAllSessions();
    this.session.clear();
  };

  /** Confirms an email from the link; refreshes the signed-in user when it is the same account. */
  readonly verifyEmail = async (token: string): Promise<SessionUser | null> => {
    const result = await this.api.verifyEmail(token);
    const user = result?.user ? normalizeUser(result.user) : null;
    const current = this.session.getSnapshot().user;
    if (user && current && current.id === user.id) this.session.updateUser(user);
    return user;
  };

  readonly resendVerification = (): Promise<void> => this.api.resendVerification();

  readonly requestPasswordReset = (email: string): Promise<void> => this.api.forgotPassword(email.trim());

  private updateUser(raw: unknown): void {
    if (raw && typeof raw === 'object') this.session.updateUser(normalizeUser(raw));
  }

  /** Users paste codes with spaces or dashes ("123 456", recovery "abcd-efgh"): keep dashes, drop spaces. */
  static cleanCode(code: string): string {
    return code.replace(/\s+/g, '').trim();
  }
}
