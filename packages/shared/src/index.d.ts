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
  | 'DRAFT'
  | 'DEPLOYED'
  | 'TOKENS_MINTED'
  | 'LISTED'
  | 'CLOSED_SUCCESS'
  | 'CLOSED_FAILED';

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
