import type { IHttpClient } from '../http/HttpClient';
import { CHAIN_TIMEOUT_MS, enc } from './timeouts';
import type { ChainActionResult, ListingDetail, ListingEnvelope, Pool } from './types';

/** Primary offerings: public catalog, the offering page and investor actions. */
export class ListingsApi {
  constructor(private readonly http: IHttpClient) {}

  async pools(): Promise<Pool[]> {
    const data = await this.http.get<unknown>('/api/market/pools', { auth: 'none' });
    return Array.isArray(data) ? (data as Pool[]) : [];
  }

  /** Sends the session (when any) so the snapshot includes the investor's on-chain units. */
  get(id: string): Promise<ListingEnvelope> {
    return this.http.send<ListingEnvelope>(`/api/listings/${enc(id)}`, { timeoutMs: CHAIN_TIMEOUT_MS });
  }

  /** Custodial / sandbox path: the platform signs. */
  contribute(id: string, usdcAmount: number): Promise<ListingDetail> {
    return this.http.post<ListingDetail>(
      `/api/listings/${enc(id)}/contribute`,
      { usdcAmount },
      { timeoutMs: CHAIN_TIMEOUT_MS },
    );
  }

  contributePreparePath(id: string): string {
    return `/api/listings/${enc(id)}/contribute/prepare`;
  }

  contributeSubmitPath(id: string): string {
    return `/api/listings/${enc(id)}/contribute/submit`;
  }

  refundPreparePath(id: string): string {
    return `/api/listings/${enc(id)}/refund/prepare`;
  }

  refundSubmitPath(id: string): string {
    return `/api/listings/${enc(id)}/refund/submit`;
  }

  finalize(id: string): Promise<ChainActionResult> {
    return this.http.post<ChainActionResult>(
      `/api/listings/${enc(id)}/finalize`,
      {},
      { timeoutMs: CHAIN_TIMEOUT_MS },
    );
  }

  refund(id: string): Promise<ChainActionResult> {
    return this.http.post<ChainActionResult>(
      `/api/listings/${enc(id)}/refund`,
      {},
      { timeoutMs: CHAIN_TIMEOUT_MS },
    );
  }

  trustline(id: string): Promise<unknown> {
    return this.http.post<unknown>(`/api/listings/${enc(id)}/trustline`, {}, { timeoutMs: CHAIN_TIMEOUT_MS });
  }

  claim(id: string): Promise<ChainActionResult> {
    return this.http.post<ChainActionResult>(
      `/api/listings/${enc(id)}/claim`,
      {},
      { timeoutMs: CHAIN_TIMEOUT_MS },
    );
  }

  distribute(id: string): Promise<ChainActionResult> {
    return this.http.post<ChainActionResult>(
      `/api/listings/${enc(id)}/distribute`,
      {},
      { timeoutMs: CHAIN_TIMEOUT_MS },
    );
  }

  claimDividends(id: string): Promise<{ amount: number; user: unknown }> {
    return this.http.post(`/api/listings/${enc(id)}/dividends/claim`, {});
  }
}
