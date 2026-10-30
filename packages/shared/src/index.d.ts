/**
 * @fractachain/shared — the HTTP contract between the API and the web app.
 *
 * Types only: both sides import these with `import type`, so nothing here is
 * ever bundled or executed. Changing a shape in this file is changing the
 * public API, and the compiler flags every caller on both sides.
 */

/* ------------------------------------------------------------------ *
 * Response envelope
 * ------------------------------------------------------------------ */

export interface ApiSuccess<T> {
  success: true;
  data: T;
}

export interface ApiFailure {
  success: false;
  message: string;
  /** Stable machine-readable code (e.g. `UNAUTHENTICATED`, `VALIDATION_FAILED`). */
  code?: string;
  /** Field-level validation issues, when `code === 'VALIDATION_FAILED'`. */
  issues?: { path: string; message: string }[];
}

export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

/* ------------------------------------------------------------------ *
 * Identity & onboarding
 * ------------------------------------------------------------------ */

export type CustodyMode = 'CUSTODIAL' | 'SELF' | null;

/**
 * `REVOKED` differs from `REJECTED`: the investor was approved, traded, and
 * compliance later withdrew the approval (on-chain the trustline is frozen).
 */
export type KycStatus = 'UNREGISTERED' | 'PENDING' | 'APPROVED' | 'REJECTED' | 'REVOKED';

export type AuthProvider = 'email' | 'firebase-google' | 'wallet';

export interface Holding {
  listingId: string;
  tokenTicker: string;
  usdcAmount: number;
  tokens: number;
  tokensOwed: number;
  pendingDividendUsdc?: number;
  tokensOnChain?: number;
  refundedAt?: string;
  refundHash?: string;
}

export interface PublicAccount {
  id: string;
  email: string;
  name: string;
  avatar: string;
  custodyMode: CustodyMode;
  publicKey: string;
  kycStatus: KycStatus;
  kycId?: string;
  legalName?: string;
  cuit?: string;
  selfieUrl?: string;
  holdings: Holding[];
  trustlines: string[];
  cashUsdc: number;
  xlmBalance?: number;
  faucetFunded?: boolean;
  isAdmin: boolean;
  /** TOTP second factor active on this account. */
  twoFactorEnabled: boolean;
  /** The email address was confirmed (Google accounts are verified by Google). */
  emailVerified: boolean;
  uid?: string;
  authProvider?: string;
  createdAt?: string;
}

/** Who verifies identity: Didit's hosted flow, or the in-app form reviewed by compliance. */
export type KycProvider = 'didit' | 'manual';

/** `GET /api/kyc/provider` */
export interface KycProviderInfo {
  provider: KycProvider;
  /** The in-app selfie is required only without an identity provider. */
  selfieRequired: boolean;
}

/** Didit session statuses (case-sensitive, as Didit reports them). */
export type VerificationSessionStatus =
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

/** `GET /api/kyc/verification` and `POST /api/kyc/verification/sync` (`data`). */
export interface VerificationView {
  provider: KycProvider;
  kycStatus: KycStatus;
  /** Present once a hosted session was started. */
  session?: {
    status: VerificationSessionStatus;
    /** Only while the session can still be completed with the same link. */
    resumeUrl?: string;
    canRestart: boolean;
    updatedAt: string;
  };
  /** What the provider read from the document, once approved. */
  identity?: { fullName?: string; documentType?: string; issuingState?: string };
  /** Why the account was rejected or revoked, when it was. */
  reason?: string;
}

/** `POST /api/kyc/verification`: where to send the browser. */
export interface VerificationStart {
  url: string;
  sessionId: string;
}

export interface SessionPayload {
  success: true;
  token: string;
  /** ISO timestamp after which the token is rejected and the user must sign in again. */
  expiresAt: string;
  user: PublicAccount;
  message?: string;
}

/**
 * Answer of a login endpoint when the account has 2FA: no session yet. The
 * client sends the code with the challenge to `POST /api/auth/2fa/verify`.
 */
export interface TwoFactorChallengePayload {
  success: true;
  twoFactorRequired: true;
  challenge: string;
  /** ISO timestamp after which the challenge must be restarted from the login. */
  expiresAt: string;
}

export type LoginPayload = SessionPayload | TwoFactorChallengePayload;

export interface AuditEntry {
  id: string;
  at: string;
  actorId: string | null;
  actorEmail: string | null;
  action: string;
  target: string | null;
  ip: string | null;
  requestId: string | null;
  outcome: 'success' | 'failure';
  details?: Record<string, unknown>;
}

export interface WalletSignaturePayload {
  publicKey: string;
  message: string;
  signature: string;
}

/* ------------------------------------------------------------------ *
 * Issuance & market
 * ------------------------------------------------------------------ */

export type PaymentKind = 'XLM' | 'USDC' | 'USDT';
export type ProductKind = 'LICITACION' | 'FORWARD' | 'WARRANT' | 'STOCK';
export type OrderSide = 'BUY' | 'SELL';

export type ListingStatus =
  'DRAFT' | 'DEPLOYED' | 'TOKENS_MINTED' | 'LISTED' | 'CLOSED_SUCCESS' | 'CLOSED_FAILED';

export type PoolStatus = 'OPEN' | 'SUCCESSFUL' | 'SETTLED' | 'FAILED';

export type SettlePolicy = 'ON_MIN' | 'ON_DATE';

export interface CompanyDossier {
  legalName: string;
  tradeName: string;
  cuit: string;
  jurisdiction: string;
  sector: string;
  ticker: string;
  tokenTicker: string;
  isin: string;
  authorizedShares: number;
  sharesToTokenize: number;
  pricePerShareUsdc: number;
  cajaSubaccount: string;
  custodianCuit: string;
  cnvRecordId: string;
  bymaRequestId: string;
  legalTermsUri: string;
  estatutoHash: string;
  auditor: string;
  issuerPublicKey: string;
  /** Company wallet that receives the raise — the `Fiduciary` of the licitación contract. */
  proceedsWallet: string;
  paymentKind: PaymentKind;
  offeringSoftCapUsdc: number;
  offeringHardCapUsdc: number;
  offeringDays: number;
  tnaUsd: number;
  useOfProceeds: string;
  minInvestmentUsdc?: number;
}

export interface Listing {
  id: string;
  dossier: CompanyDossier;
  status: ListingStatus;
  stockContract: string;
  licitacionContract: string;
  factoryProductId: number | null;
  wasmStock: string;
  wasmLicitacion: string;
  tokensMinted: number;
  sharesCustodied: number;
  cvDepositHash: string;
  raisedUsdc: number;
  settlePolicy?: SettlePolicy;
  settleAt?: string;
  closedAt?: string;
  listedAt?: string;
  deployedAt?: string;
  mintedAt?: string;
  createdAt: string;
  proceedsPaidTo?: string;
  proceedsPaidAt?: string;
  finalizeHash?: string;
  finalizeAt?: string;
}

/* ------------------------------------------------------------------ *
 * Instaward 1: non-custodial transactions and chain reads
 * (docs/instaward-1/plan.md)
 * ------------------------------------------------------------------ */

/** A payment asset as the contracts see it (Stellar Asset Contract). */
export interface ChainAsset {
  code: string;
  /** Classic issuer (G…); null for native XLM. */
  issuer: string | null;
  /** SAC contract ID (C…). */
  contractId: string;
  /** Read from the token's `decimals()`. */
  decimals: number;
  explorer: string;
}

export type TxAction = 'contribute' | 'refund' | 'finalize' | 'usdc_trustline';

export type TxBuildRequest =
  | { action: 'contribute'; listingId: string; amount: number }
  | { action: 'refund'; listingId: string }
  | { action: 'finalize'; listingId: string }
  | { action: 'usdc_trustline' };

export interface TxBuildResult {
  buildId: string;
  /** Unsigned, simulated and prepared transaction (base64 envelope). */
  xdr: string;
  action: TxAction;
  network: string;
  networkPassphrase: string;
  /** The investor's own account: the only signer. */
  source: string;
  contractId?: string;
  function?: string;
  args?: { name: string; value: string }[];
  asset?: ChainAsset;
  /** Total fee in stroops. */
  fee: string;
  expiresAt: string;
}

export interface TxSubmitRequest {
  buildId: string;
  signedXdr: string;
}

export type TxStatus = 'PENDING' | 'SUCCESS' | 'FAILED' | 'NOT_FOUND';

export interface TxSubmitResult {
  hash: string;
  status: TxStatus;
  ledger?: number;
  explorer: string;
  action: TxAction;
  /** Refreshed listing when the action changed one. */
  listing?: unknown;
}

export interface TxStatusResult {
  hash: string;
  status: TxStatus;
  ledger?: number;
  explorer: string;
}

/** A contract reference shown next to every chain-read value. */
export interface ChainRef {
  contractId: string;
  explorer: string;
}

export interface ChainNetwork {
  network: string;
  networkPassphrase: string;
  rpcUrl: string;
  horizonUrl: string;
  explorerUrl: string;
  usdc: ChainAsset | null;
  contracts: {
    factory: ChainRef | null;
    stockVaults: ChainRef[];
    tenders: ChainRef[];
    forwards: ChainRef[];
    warrants: ChainRef[];
  };
}

export type TenderStateName = 'Open' | 'Successful' | 'Failed' | 'Terminated';

export interface ChainTender extends ChainRef {
  readAt: string;
  /** Contract functions this payload was read from. */
  reads: string[];
  state: { code: number; name: TenderStateName };
  totalRaised: number;
  pricePerUnit: number;
  /** null on tenders deployed before the getters existed. */
  softCap: number | null;
  hardCap: number | null;
  deadline: string | null;
  paymentToken: ChainAsset;
  fiduciary: string | null;
  proceedsWithdrawn: boolean;
  legalInfo: { cnvRecordId: string; legalTermsUri: string; fideicomisoHash: string } | null;
  holder?: { address: string; rwaBalance: number; paymentBalance: number };
}

export interface ChainPortfolio {
  address: string;
  readAt: string;
  xlm: number;
  usdc: { asset: ChainAsset; balance: number; trustline: boolean } | null;
  positions: {
    tender: ChainRef;
    listingId: string | null;
    title: string | null;
    state: TenderStateName;
    rwaBalance: number;
    pricePerUnit: number;
    paymentToken: ChainAsset;
  }[];
}

export interface ChainForward extends ChainRef {
  readAt: string;
  reads: string[];
  state: string;
  cropName: string;
  totalKilos: number;
  parties: { producer: string; buyer: string } | null;
  arbiter: string | null;
  position: {
    delivered: boolean;
    deliveredAt: string | null;
    disputed: boolean;
    rollovers: number;
    escrow: number;
  } | null;
  paymentToken: ChainAsset;
}

export interface ChainWarrant extends ChainRef {
  readAt: string;
  reads: string[];
  status: string;
  loanAmount: number;
  producer: string | null;
  terms: {
    inventoryValue: number;
    ltvBps: number;
    interestRateBps: number;
    fundedAt: string | null;
    dueAt: string | null;
    graceSeconds: number;
  } | null;
  paymentToken: ChainAsset;
}

export interface ChainStockVault extends ChainRef {
  readAt: string;
  reads: string[];
  metadata: Record<string, string | number | boolean | null>;
  unclaimedPool: number;
  mintPaused: boolean;
  lastProof: Record<string, string | number | null> | null;
  paymentToken: ChainAsset;
  holder?: { address: string; balance: number; claimable: number };
}
