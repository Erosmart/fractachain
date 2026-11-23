import type {
  ChainForward,
  ChainNetwork,
  ChainPortfolio,
  ChainStockVault,
  ChainTender,
  ChainWarrant,
} from '@fractachain/shared';
import type { IHttpClient } from '../http/HttpClient';
import { CHAIN_TIMEOUT_MS, enc } from './timeouts';

const opts = { auth: 'none' as const, timeoutMs: CHAIN_TIMEOUT_MS };
const holderQuery = (holder?: string) => (holder ? `?holder=${enc(holder)}` : '');

/**
 * Read-only views of the deployed contracts (Instaward 1, Deliverable 3).
 * Every value comes from a contract call or Horizon — never from the
 * platform database — and carries the contract ID it was read from.
 */
export class ChainApi {
  constructor(private readonly http: IHttpClient) {}

  network(): Promise<ChainNetwork> {
    return this.http.get<ChainNetwork>('/api/chain/network', opts);
  }

  tender(contractId: string, holder?: string): Promise<ChainTender> {
    return this.http.get<ChainTender>(`/api/chain/tenders/${enc(contractId)}${holderQuery(holder)}`, opts);
  }

  portfolio(address: string): Promise<ChainPortfolio> {
    return this.http.get<ChainPortfolio>(`/api/chain/portfolio/${enc(address)}`, opts);
  }

  forwards(): Promise<ChainForward[]> {
    return this.http.get<ChainForward[]>('/api/chain/forwards', opts);
  }

  warrants(): Promise<ChainWarrant[]> {
    return this.http.get<ChainWarrant[]>('/api/chain/warrants', opts);
  }

  stocks(holder?: string): Promise<ChainStockVault[]> {
    return this.http.get<ChainStockVault[]>(`/api/chain/stocks${holderQuery(holder)}`, opts);
  }
}
