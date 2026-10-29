import type { WalletSignaturePayload } from '@fractachain/shared';
import type { IHttpClient } from '../http/HttpClient';
import { CHAIN_TIMEOUT_MS } from './timeouts';
import type {
  CustodyResponse,
  LoginResponse,
  SessionResponse,
  TwoFactorEnableResult,
  TwoFactorSetup,
} from './types';

export interface FirebaseLoginBody {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  idToken: string;
}

/**
 * `/api/auth/*`: sessions (cookie-based), second factor, email verification,
 * password reset, wallet linking and custody choice.
 *
 * Login endpoints answer either a session (the API also sets the HttpOnly
 * cookie) or a 2FA challenge; see {@link LoginResponse}.
 */
export class AuthApi {
  constructor(private readonly http: IHttpClient) {}

  loginWithEmail(email: string, password: string, name?: string): Promise<LoginResponse> {
    return this.http.send<LoginResponse>('/api/auth/email', {
      method: 'POST',
      body: { email, password, name },
      auth: 'none',
    });
  }

  loginWithFreighter(payload: WalletSignaturePayload): Promise<LoginResponse> {
    return this.http.send<LoginResponse>('/api/auth/freighter', {
      method: 'POST',
      body: payload,
      auth: 'none',
      timeoutMs: CHAIN_TIMEOUT_MS,
    });
  }

  /** The server verifies `idToken` with Google and ignores the other fields for identity. */
  loginWithFirebase(body: FirebaseLoginBody): Promise<LoginResponse> {
    return this.http.send<LoginResponse>('/api/auth/firebase', { method: 'POST', body, auth: 'none' });
  }

  /** Second step of a login: TOTP code or a recovery code. A wrong code answers 401. */
  verifyTwoFactor(challenge: string, code: string): Promise<SessionResponse> {
    return this.http.send<SessionResponse>('/api/auth/2fa/verify', {
      method: 'POST',
      body: { challenge, code },
      auth: 'none',
    });
  }

  async me(): Promise<unknown> {
    const body = await this.http.send<{ success: true; user: unknown }>('/api/auth/me');
    return body.user;
  }

  /** Revokes the session and clears the cookie; the caller clears local state regardless. */
  async logout(): Promise<void> {
    await this.http.send('/api/auth/logout', { method: 'POST', body: {}, auth: 'none' });
  }

  /** Ends every session of the account, this one included. */
  async revokeAllSessions(): Promise<void> {
    await this.http.send('/api/auth/sessions/revoke-all', { method: 'POST', body: {} });
  }

  setupTwoFactor(): Promise<TwoFactorSetup> {
    return this.http.post<TwoFactorSetup>('/api/auth/2fa/setup', {});
  }

  enableTwoFactor(code: string): Promise<TwoFactorEnableResult> {
    return this.http.post<TwoFactorEnableResult>('/api/auth/2fa/enable', { code });
  }

  disableTwoFactor(code: string): Promise<{ user: unknown }> {
    return this.http.post<{ user: unknown }>('/api/auth/2fa/disable', { code });
  }

  /** Public link target: works with or without a session. */
  verifyEmail(token: string): Promise<{ user: unknown }> {
    return this.http.post<{ user: unknown }>('/api/auth/email/verify', { token }, { auth: 'none' });
  }

  async resendVerification(): Promise<void> {
    await this.http.send('/api/auth/email/resend', { method: 'POST', body: {} });
  }

  /** Always succeeds (the API never reveals whether the email exists). */
  async forgotPassword(email: string): Promise<void> {
    await this.http.send('/api/auth/password/forgot', { method: 'POST', body: { email }, auth: 'none' });
  }

  resetPassword(token: string, password: string): Promise<LoginResponse> {
    return this.http.send<LoginResponse>('/api/auth/password/reset', {
      method: 'POST',
      body: { token, password },
      auth: 'none',
    });
  }

  linkWallet(payload: WalletSignaturePayload): Promise<{ success: true; user: unknown }> {
    return this.http.send('/api/auth/wallet/link', {
      method: 'POST',
      body: payload,
      timeoutMs: CHAIN_TIMEOUT_MS,
    });
  }

  chooseCustody(mode: 'CUSTODIAL' | 'SELF', publicKey?: string): Promise<CustodyResponse> {
    return this.http.send<CustodyResponse>('/api/auth/wallet', {
      method: 'POST',
      body: { mode, publicKey },
      timeoutMs: CHAIN_TIMEOUT_MS,
    });
  }

  async walletSecret(): Promise<string> {
    const body = await this.http.send<{ success: true; secret?: string }>('/api/auth/wallet/secret');
    return String(body.secret || '');
  }
}
