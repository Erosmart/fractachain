import type { IHttpClient } from '../http/HttpClient';
import { CHAIN_TIMEOUT_MS, enc } from './timeouts';
import type { ChainActionResult, ListingDetail, ListingEnvelope, Pool } from './types';

/** Subscription activity of an offering: investors and money in per day. */
export interface ListingActivity {
  investors: number;
  /** One row per day with contributions, oldest first (`date` is YYYY-MM-DD). */
  daily: { date: string; usdc: number }[];
  /** Raised before contributions were logged with a date. */
  undatedUsdc: number;
}

/** Income already distributed to holders (only its presence matters to the UI). */
export interface ListingDividend {
  id?: string;
  amountUsdc?: number;
  [field: string]: unknown;
}

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

  /** Public: investor count and the subscription curve. */
  async activity(id: string): Promise<ListingActivity> {
    const data = await this.http.get<Partial<ListingActivity>>(`/api/listings/${enc(id)}/activity`, {
      auth: 'none',
    });
    return {
      investors: Number(data?.investors) || 0,
      daily: Array.isArray(data?.daily)
        ? data.daily
            .filter((d) => typeof d?.date === 'string')
            .map((d) => ({ date: d.date, usdc: Number(d.usdc) || 0 }))
        : [],
      undatedUsdc: Number(data?.undatedUsdc) || 0,
    };
  }

  async dividends(id: string): Promise<ListingDividend[]> {
    const data = await this.http.get<unknown>(`/api/listings/${enc(id)}/dividends`, { auth: 'none' });
    return Array.isArray(data) ? (data as ListingDividend[]) : [];
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
