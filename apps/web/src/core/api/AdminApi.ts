import type { Listing, SettlePolicy, SupportMessage } from '@fractachain/shared';
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

/** Didit session status, as the provider names it (case-sensitive). */
export type ProviderSessionStatus =
  | 'Not Started'
  | 'In Progress'
  | 'In Review'
  | 'Approved'
  | 'Declined'
  | 'Resubmitted'
  | 'Awaiting User'
  | 'Abandoned'
  | 'Expired'
  | 'Kyc Expired';

export type KycReviewStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'REVOKED';

/** Summary of the identity provider's decision (no resume link, no biometrics). */
export interface KycVerificationSummary {
  provider: 'didit';
  status: ProviderSessionStatus;
  identity?: {
    fullName?: string;
    documentType?: string;
    documentNumberLast4?: string;
    nationality?: string;
    issuingState?: string;
  };
  checks?: { document?: string; liveness?: string; faceMatch?: string; aml?: string; amlHits?: number };
  updatedAt: string;
}

/** A row of the compliance queue (`GET /api/kyc`). */
export interface KycQueueRow {
  id: string;
  fullName: string;
  docType: 'CUIT' | 'DNI' | 'PASSPORT';
  docNumber: string;
  country: string;
  walletAddress: string;
  status: KycReviewStatus;
  isGafiHighRisk: boolean;
  createdAt: string;
  selfieUrl?: string;
  userId?: string;
  email?: string;
  verification?: KycVerificationSummary;
}

/** `GET /api/onchain/status`: RPC health and the deployed contract ids. */
export interface NetworkStatus {
  network: string;
  onChain: boolean;
  rpcOk: boolean;
  ledger: number | null;
  error?: string;
  factory?: string | null;
  licitacion?: string | null;
  stockVault?: string | null;
  issuer?: string | null;
}

export interface DividendRecord {
  id: string;
  totalUsdc: number;
  createdAt?: string;
  [field: string]: unknown;
}

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

/** Admin endpoints: issuance, Merval catalog, testnet settings, compliance queue. */
export class AdminApi {
  constructor(private readonly http: IHttpClient) {}

  /** Compliance queue, newest first (every status; the console filters client-side). */
  async kycQueue(): Promise<KycQueueRow[]> {
    const data = await this.http.get<unknown>('/api/kyc');
    return Array.isArray(data) ? (data as KycQueueRow[]) : [];
  }

  approveKyc(id: string): Promise<unknown> {
    return this.http.post(`/api/kyc/${enc(id)}/approve`, {}, { timeoutMs: CHAIN_TIMEOUT_MS });
  }

  rejectKyc(id: string, reason: string): Promise<unknown> {
    return this.http.post(`/api/kyc/${enc(id)}/reject`, { reason });
  }

  /** Hard freeze: the API also revokes the holder's trustline authorization on-chain. */
  revokeKyc(id: string, reason: string): Promise<unknown> {
    return this.http.post(`/api/kyc/${enc(id)}/revoke`, { reason }, { timeoutMs: CHAIN_TIMEOUT_MS });
  }

  networkStatus(): Promise<NetworkStatus> {
    return this.http.get<NetworkStatus>('/api/onchain/status', { timeoutMs: CHAIN_TIMEOUT_MS });
  }

  async dividends(listingId: string): Promise<DividendRecord[]> {
    const data = await this.http.get<unknown>(`/api/listings/${enc(listingId)}/dividends`);
    return Array.isArray(data) ? (data as DividendRecord[]) : [];
  }

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

  /* ------------------------------- support inbox ------------------------------- */

  async supportMessages(status: 'open' | 'closed' | 'all' = 'open'): Promise<SupportMessage[]> {
    const data = await this.http.get<unknown>(`/api/admin/support?status=${enc(status)}`);
    return Array.isArray(data) ? (data as SupportMessage[]) : [];
  }

  closeSupportMessage(id: string): Promise<SupportMessage> {
    return this.http.post<SupportMessage>(`/api/admin/support/${enc(id)}/close`, {});
  }

  reopenSupportMessage(id: string): Promise<SupportMessage> {
    return this.http.post<SupportMessage>(`/api/admin/support/${enc(id)}/reopen`, {});
  }
}
