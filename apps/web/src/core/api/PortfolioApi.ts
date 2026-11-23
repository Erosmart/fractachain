import type { IHttpClient } from '../http/HttpClient';
import { CHAIN_TIMEOUT_MS } from './timeouts';
import type { Portfolio } from './types';

export class PortfolioApi {
  constructor(private readonly http: IHttpClient) {}

  /** The server also self-heals the wallet funding on this call, hence the long timeout. */
  get(): Promise<Portfolio> {
    return this.http.get<Portfolio>('/api/portfolio', { timeoutMs: CHAIN_TIMEOUT_MS });
  }
}
