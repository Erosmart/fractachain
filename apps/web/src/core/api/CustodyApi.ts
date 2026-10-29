import type { IHttpClient } from '../http/HttpClient';

/** Tokenized Merval stocks and their proof of reserve. */
export class CustodyApi {
  constructor(private readonly http: IHttpClient) {}

  /** Raw rows: the stocks screen normalizes legacy and current field names. */
  async stocks(): Promise<unknown[] | null> {
    const data = await this.http.get<unknown>('/api/custody/stocks', { auth: 'none' });
    return Array.isArray(data) ? data : null;
  }

  proofOfReserve(): Promise<unknown> {
    return this.http.get<unknown>('/api/custody/por', { auth: 'none' });
  }
}
