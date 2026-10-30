import type { AccountCloseRequest, LegalVersions } from '@fractachain/shared';
import type { IHttpClient } from '../http/HttpClient';

/**
 * Legal versions and the account's privacy rights: data export and closure
 * (`/api/legal`, `/api/account/*`).
 */
export class AccountApi {
  constructor(private readonly http: IHttpClient) {}

  /** Current versions of the terms and the privacy policy (public). */
  legal(): Promise<LegalVersions> {
    return this.http.get<LegalVersions>('/api/legal', { auth: 'none' });
  }

  /** Everything the platform holds about the account, as a JSON file. */
  exportData(): Promise<Blob> {
    return this.http.blob('/api/account/export');
  }

  /** Closes the account. 409 when funds or positions remain; 401 when it needs a fresh login. */
  async close(request: AccountCloseRequest): Promise<void> {
    // `auth: 'none'`: a 401 here means "wrong password / sign in again", not an expired
    // session — the page explains it instead of signing the user out mid-flow.
    await this.http.send('/api/account/close', { method: 'POST', body: request, auth: 'none' });
  }
}
