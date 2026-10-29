import type { IHttpClient } from '../http/HttpClient';
import type { OnChainStatus } from './types';

export class OnChainApi {
  constructor(private readonly http: IHttpClient) {}

  status(): Promise<OnChainStatus> {
    return this.http.get<OnChainStatus>('/api/onchain/status', { auth: 'none' });
  }
}
