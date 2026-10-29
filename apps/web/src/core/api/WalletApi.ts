import type { IHttpClient } from '../http/HttpClient';
import { CHAIN_TIMEOUT_MS } from './timeouts';
import type { UsdcFundResult, WalletState } from './types';

/** Balances and the testnet USDC faucet. */
export class WalletApi {
  constructor(private readonly http: IHttpClient) {}

  /** With a session the server reads the session wallet; `account` only matters when anonymous. */
  state(account: string): Promise<WalletState> {
    return this.http.get<WalletState>(`/api/wallet/state?account=${encodeURIComponent(account)}`, {
      timeoutMs: CHAIN_TIMEOUT_MS,
    });
  }

  fundUsdc(): Promise<UsdcFundResult> {
    return this.http.post<UsdcFundResult>('/api/wallet/usdc/fund', {}, { timeoutMs: CHAIN_TIMEOUT_MS });
  }

  submitUsdcTrustline(xdr: string): Promise<UsdcFundResult> {
    return this.http.post<UsdcFundResult>(
      '/api/wallet/usdc/submit',
      { xdr },
      { timeoutMs: CHAIN_TIMEOUT_MS },
    );
  }
}
