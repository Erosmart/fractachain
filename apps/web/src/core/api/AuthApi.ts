import type { WalletSignaturePayload } from '@fractachain/shared';
import type { IHttpClient } from '../http/HttpClient';
import { CHAIN_TIMEOUT_MS } from './timeouts';
import type { CustodyResponse, SessionResponse } from './types';

export interface FirebaseLoginBody {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  idToken: string;
}

/** `/api/auth/*`: sessions, wallet linking and custody choice. */
export class AuthApi {
  constructor(private readonly http: IHttpClient) {}

  loginWithEmail(email: string, password: string, name?: string): Promise<SessionResponse> {
    return this.http.send<SessionResponse>('/api/auth/email', {
      method: 'POST',
      body: { email, password, name },
      auth: 'none',
    });
  }

  loginWithFreighter(payload: WalletSignaturePayload): Promise<SessionResponse> {
    return this.http.send<SessionResponse>('/api/auth/freighter', {
      method: 'POST',
      body: payload,
      auth: 'none',
      timeoutMs: CHAIN_TIMEOUT_MS,
    });
  }

  /** The server verifies `idToken` with Google and ignores the other fields for identity. */
  loginWithFirebase(body: FirebaseLoginBody): Promise<SessionResponse> {
    return this.http.send<SessionResponse>('/api/auth/firebase', { method: 'POST', body, auth: 'none' });
  }

  async me(token?: string): Promise<unknown> {
    const body = await this.http.send<{ success: true; user: unknown }>('/api/auth/me', { token });
    return body.user;
  }

  /** Server-side revocation; the caller clears local state regardless of the outcome. */
  async logout(token: string): Promise<void> {
    await this.http.send('/api/auth/logout', { method: 'POST', body: {}, token });
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
