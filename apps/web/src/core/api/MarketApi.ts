import type { IHttpClient } from '../http/HttpClient';
import { CHAIN_TIMEOUT_MS, enc } from './timeouts';
import type {
  Market,
  OrderRequest,
  SandboxBook,
  SandboxOrderResult,
  SdexBook,
  SdexCancelRequest,
  SdexOrderResult,
} from './types';

/** Secondary market: the sandbox matcher and the Stellar DEX. */
export class MarketApi {
  constructor(private readonly http: IHttpClient) {}

  async markets(): Promise<Market[]> {
    const data = await this.http.get<unknown>('/api/orderbook/markets', { auth: 'none' });
    return Array.isArray(data) ? (data as Market[]) : [];
  }

  sandboxBook(listingId: string): Promise<SandboxBook> {
    return this.http.get<SandboxBook>(`/api/orderbook/${enc(listingId)}`);
  }

  sdexBook(listingId: string): Promise<SdexBook> {
    return this.http.get<SdexBook>(`/api/sdex/${enc(listingId)}`);
  }

  placeSandboxOrder(listingId: string, order: OrderRequest): Promise<SandboxOrderResult> {
    return this.http.post<SandboxOrderResult>(`/api/orderbook/${enc(listingId)}/orders`, order);
  }

  cancelSandboxOrder(orderId: string): Promise<SandboxOrderResult> {
    return this.http.post<SandboxOrderResult>(`/api/orderbook/orders/${enc(orderId)}/cancel`, {});
  }

  /** Custodial accounts: build, sign and submit server-side. SDEX names the size `quantity`. */
  placeSdexOrder(listingId: string, order: OrderRequest): Promise<SdexOrderResult> {
    return this.http.post<SdexOrderResult>(
      `/api/sdex/${enc(listingId)}/orders`,
      { side: order.side, price: order.price, quantity: order.amount },
      { timeoutMs: CHAIN_TIMEOUT_MS },
    );
  }

  /** Self-custody: unsigned XDR for the wallet to sign. */
  prepareSdexOrder(listingId: string, order: OrderRequest): Promise<{ xdr: string }> {
    return this.http.post<{ xdr: string }>(
      `/api/sdex/${enc(listingId)}/orders/prepare`,
      { side: order.side, price: order.price, quantity: order.amount },
      { timeoutMs: CHAIN_TIMEOUT_MS },
    );
  }

  /** Custodial accounts get it submitted; self-custody gets `{ xdr }` back to sign. */
  cancelSdexOrder(listingId: string, req: SdexCancelRequest): Promise<{ xdr?: string; hash?: string }> {
    return this.http.post(`/api/sdex/${enc(listingId)}/orders/cancel`, req, { timeoutMs: CHAIN_TIMEOUT_MS });
  }

  sdexTrustlinePreparePath(listingId: string): string {
    return `/api/sdex/${enc(listingId)}/trustline/prepare`;
  }

  readonly sdexSubmitPath = '/api/sdex/submit';

  submitSdex(xdr: string): Promise<{ hash?: string }> {
    return this.http.post<{ hash?: string }>(this.sdexSubmitPath, { xdr }, { timeoutMs: CHAIN_TIMEOUT_MS });
  }
}
