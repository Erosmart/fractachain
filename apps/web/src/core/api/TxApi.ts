import type { TxBuildRequest, TxBuildResult, TxStatusResult, TxSubmitResult } from '@fractachain/shared';
import type { IHttpClient } from '../http/HttpClient';
import { CHAIN_TIMEOUT_MS, enc } from './timeouts';

/**
 * Non-custodial transactions (Instaward 1, Deliverable 2): the API builds and
 * prepares the Soroban transaction, the investor signs it in Freighter, the
 * API validates and submits it.
 */
export class TxApi {
  constructor(private readonly http: IHttpClient) {}

  build(request: TxBuildRequest): Promise<TxBuildResult> {
    return this.http.post<TxBuildResult>('/api/tx/build', request, { timeoutMs: CHAIN_TIMEOUT_MS });
  }

  submit(buildId: string, signedXdr: string): Promise<TxSubmitResult> {
    return this.http.post<TxSubmitResult>(
      '/api/tx/submit',
      { buildId, signedXdr },
      { timeoutMs: CHAIN_TIMEOUT_MS },
    );
  }

  status(hash: string): Promise<TxStatusResult> {
    return this.http.get<TxStatusResult>(`/api/tx/${enc(hash)}`, { auth: 'none' });
  }
}
