import type { Listing, SettlePolicy } from '@fractachain/shared';
import type { IHttpClient } from '../http/HttpClient';
import { CHAIN_TIMEOUT_MS, DEPLOY_TIMEOUT_MS, enc } from './timeouts';
import type {
  AuditEntry,
  AuditQuery,
  ChainActionResult,
  DemoDossier,
  DividendResult,
  MervalStock,
  NewStockInput,
  TestnetAdminView,
  TestnetSettings,
} from './types';

/** Issuer lifecycle steps exposed as `/api/listings/:id/<action>`. */
export type ListingAction =
  | 'deploy'
  | 'mint'
  | 'licitacion'
  | 'settle'
  | 'close'
  | 'finalize'
  | 'proceeds-wallet'
  | 'withdraw-proceeds';

const SLOW_ACTIONS: ReadonlySet<ListingAction> = new Set(['deploy', 'licitacion', 'mint']);

/** Admin-only endpoints: issuance, Merval catalog, testnet settings, compliance. */
export class AdminApi {
  constructor(private readonly http: IHttpClient) {}

  /** Security/admin audit trail, newest first. */
  async audit(query: AuditQuery = {}): Promise<AuditEntry[]> {
    const params = new URLSearchParams();
    params.set('limit', String(query.limit ?? 200));
    if (query.action?.trim()) params.set('action', query.action.trim());
    if (query.actor?.trim()) params.set('actor', query.actor.trim());
    const data = await this.http.get<unknown>(`/api/admin/audit?${params.toString()}`);
    return Array.isArray(data) ? (data as AuditEntry[]) : [];
  }

  async listings(): Promise<Listing[]> {
    const data = await this.http.get<unknown>('/api/listings');
    return Array.isArray(data) ? (data as Listing[]) : [];
  }

  createListing(dossier: Record<string, unknown>): Promise<Listing> {
    return this.http.post<Listing>('/api/listings', dossier, { timeoutMs: CHAIN_TIMEOUT_MS });
  }

  listingAction(id: string, action: ListingAction, body?: unknown): Promise<ChainActionResult> {
    return this.http.post<ChainActionResult>(`/api/listings/${enc(id)}/${action}`, body ?? {}, {
      timeoutMs: SLOW_ACTIONS.has(action) ? DEPLOY_TIMEOUT_MS : CHAIN_TIMEOUT_MS,
    });
  }

  demoDossier(): Promise<DemoDossier> {
    return this.http.post<DemoDossier>('/api/admin/demo-dossier', {}, { timeoutMs: CHAIN_TIMEOUT_MS });
  }

  payDividend(id: string, amountUsdc: number): Promise<DividendResult> {
    return this.http.post<DividendResult>(`/api/listings/${enc(id)}/dividends`, { amountUsdc });
  }

  async stocks(): Promise<MervalStock[]> {
    const data = await this.http.get<unknown>('/api/admin/stocks');
    return Array.isArray(data) ? (data as MervalStock[]) : [];
  }

  createStock(input: NewStockInput): Promise<MervalStock> {
    return this.http.post<MervalStock>('/api/admin/stocks', input);
  }

  setStockActive(ticker: string, active: boolean): Promise<MervalStock> {
    return this.http.post<MervalStock>(`/api/admin/stocks/${enc(ticker)}/active`, { active });
  }

  testnet(): Promise<TestnetAdminView> {
    return this.http.get<TestnetAdminView>('/api/admin/testnet', { timeoutMs: CHAIN_TIMEOUT_MS });
  }

  saveTestnet(
    settings: TestnetSettings & { settleAt?: string; settlePolicy: SettlePolicy },
  ): Promise<TestnetAdminView> {
    return this.http.post<TestnetAdminView>('/api/admin/testnet', settings);
  }

  configureIssuer(clawback = false): Promise<{ hash?: string }> {
    return this.http.post(
      '/api/admin/testnet/configure-issuer',
      { clawback },
      { timeoutMs: CHAIN_TIMEOUT_MS },
    );
  }
}
