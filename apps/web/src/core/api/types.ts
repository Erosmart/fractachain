/**
 * View models of the API responses the UI consumes. Only the fields screens
 * actually read are declared; the shared package owns the core entities.
 */
import type {
  Listing,
  ListingStatus,
  OrderSide,
  PaymentKind,
  PoolStatus,
  PublicAccount,
  SettlePolicy,
} from '@fractachain/shared';

/* ---------------------------- auth ---------------------------- */

export interface SessionResponse {
  success: true;
  token: string;
  expiresAt?: string;
  user: unknown;
  message?: string;
}

export interface CustodyResponse {
  success: true;
  user: unknown;
  secretOnce?: string;
}

/* --------------------------- wallet --------------------------- */

export interface WalletState {
  xlm: number;
  usdc: number;
  usdcIssuer: string | null;
  usdcCode: string;
  usdcSac: string | null;
}

export interface UsdcFundResult {
  status: 'FUNDED' | 'NEED_TRUSTLINE';
  funded?: boolean;
  already?: boolean;
  balance?: number;
  xdr?: string;
  publicKey?: string;
  hash?: string | null;
  trustlineHash?: string | null;
}

/* -------------------------- listings -------------------------- */

export interface ValidationCheck {
  key: string;
  ok: boolean;
  label: string;
}

export interface ValidationPack {
  listingId: string;
  status: ListingStatus;
  token: { backing: string; [field: string]: unknown };
  checks: ValidationCheck[];
  [section: string]: unknown;
}

/** Live Soroban snapshot + explorer links attached to a listing payload. */
export interface ListingOnChain {
  live?: boolean;
  state?: number;
  stateName?: string;
  raised?: number;
  price?: number;
  canFinalize?: boolean;
  finalizeReason?: string;
  investorRwa?: number | null;
  fiduciary?: string | null;
  fiduciaryXlm?: number | null;
  fiduciaryUsdc?: number | null;
  fiduciaryMismatch?: boolean;
  hash?: string | null;
  explorer?: string | null;
  contributeHash?: string | null;
  contributeExplorer?: string | null;
  finalizeExplorer?: string | null;
  trustlineHash?: string | null;
  trustlineExplorer?: string | null;
  note?: string;
  autoFinalized?: boolean;
}

export interface ListingDetail extends Listing {
  onChain?: ListingOnChain;
}

export interface ListingEnvelope {
  success: true;
  data: ListingDetail;
  validation: ValidationPack;
}

export interface Pool {
  id: string;
  title: string;
  producerName: string;
  location: string;
  targetAmount: number;
  raisedAmount: number;
  softCap: number;
  hardCap: number;
  tna: number;
  durationMonths: number;
  daysRemaining: number;
  commodityType: string;
  riskScore: string;
  isSoftCapReached: boolean;
  minInvestment: number;
  status: PoolStatus;
  tokenTicker?: string;
  ticker?: string;
  isin?: string;
  paymentKind?: PaymentKind;
  finalizeHash?: string | null;
  validation?: ValidationPack;
}

/** Result of claim / refund / finalize / distribute: shape varies, all fields optional. */
export interface ChainActionResult {
  user?: unknown;
  hash?: string | null;
  amount?: number;
  status?: ListingStatus;
  distribution?: { hash?: string; error?: string } | null;
  onChain?: ListingOnChain;
  [field: string]: unknown;
}

/* ------------------------- portfolio -------------------------- */

export interface Position {
  listingId: string;
  tokenTicker: string;
  legalName: string;
  shares: number;
  tokens: number;
  tokensOwed: number;
  tokensOnChain?: number;
  sdex?: boolean;
  costBasis: number;
  marketPrice: number;
  marketValue: number;
  pnl: number;
  pnlPct: number;
  priceSourceLabel: string;
  pendingDividendUsdc: number;
  listingStatus?: string;
  paymentKind?: string | null;
  finalizeHash?: string | null;
  refundedAt?: string | null;
  refundHash?: string | null;
  canClaim?: boolean;
  canRefund?: boolean;
}

export interface Proceed {
  listingId: string;
  tokenTicker: string;
  legalName: string;
  status: string;
  paymentKind?: string | null;
  amount: number;
  paidAt?: string | null;
  finalizeHash?: string | null;
  explorer?: string | null;
}

export interface Portfolio {
  cashUsdc: number;
  usdcOnChain?: number;
  xlmOnChain?: number;
  proceeds?: Proceed[];
  positions: Position[];
  totals: {
    costBasis: number;
    marketValue: number;
    pnl: number;
    pnlPct: number;
    pendingDividends: number;
  };
}

/* --------------------------- market --------------------------- */

export interface Market {
  listingId: string;
  tokenTicker: string;
  ticker: string;
  legalName: string;
  pricePerShareUsdc: number;
  status: string;
}

export interface SandboxLevel {
  price: number;
  amount: number;
  total: number;
  depthPercent: number;
}

export interface SandboxOrder {
  id: string;
  side: OrderSide;
  price: number;
  amount: number;
  remaining: number;
  status: string;
}

export interface BookTrade {
  id: string;
  price: number;
  amount: number;
  buyer?: string;
  seller?: string;
  createdAt: string;
  legacy?: boolean;
}

export interface SandboxBook {
  listingId: string;
  tokenTicker: string;
  legalName: string;
  refPrice: number;
  lastPrice: number;
  spread: number | null;
  asks: SandboxLevel[];
  bids: SandboxLevel[];
  trades: BookTrade[];
  myOrders: SandboxOrder[];
  reservedCash?: number;
  reservedTokens?: number;
}

export interface SdexLevel {
  price: number;
  amount: number;
  total: number;
  legacy?: boolean;
}

export interface SdexOffer {
  id: string;
  selling: { asset_code?: string; asset_type: string };
  buying: { asset_code?: string; asset_type: string };
  amount: number;
  price: number;
  legacy?: boolean;
}

export interface SdexBook {
  listingId: string;
  tokenTicker: string;
  legalName: string;
  refPrice: number;
  lastPrice: number;
  spread: number | null;
  bids: SdexLevel[];
  asks: SdexLevel[];
  trades: BookTrade[];
  myOffers: SdexOffer[];
  authorized: boolean;
  needsTrustline: boolean;
  tokenBalance: number;
  usdcBalance: number;
  usdcTotal: number;
  tokenTotal: number;
}

export interface SandboxOrderResult {
  order: SandboxOrder;
  book: SandboxBook;
  user?: unknown;
}

export interface SdexOrderResult {
  hash?: string;
  book: SdexBook;
}

export interface OrderRequest {
  side: OrderSide;
  price: number;
  amount: number;
}

export interface SdexCancelRequest {
  side: OrderSide;
  offerId: string;
  price: number;
  legacy?: boolean;
}

/* -------------------------- custody --------------------------- */

/** Row of `/api/custody/stocks` and `/api/admin/stocks`. */
export interface MervalStock {
  ticker: string;
  tokenTicker: string;
  companyName: string;
  isin: string;
  sector: string;
  priceUsdc: number;
  change24hPct: number;
  custodiedSharesInCajaDeValores: number;
  mintedTokensInStellar: number;
  lastAuditTimestamp: string;
  active: boolean;
  [field: string]: unknown;
}

/* -------------------------- on-chain -------------------------- */

export interface OnChainStatus {
  network: string;
  onChain: boolean;
  forward: string | null;
  warrant: string | null;
  stockVault: string | null;
  [field: string]: unknown;
}

/* ---------------------------- admin --------------------------- */

export interface KycRecord {
  id: string;
  fullName: string;
  docType: 'DNI' | 'PASSPORT' | 'CUIT';
  docNumber: string;
  country: string;
  walletAddress: string;
  userType: 'PRODUCER' | 'INVESTOR' | 'INSTITUTIONAL';
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'REVOKED';
  isGafiHighRisk: boolean;
  createdAt: string;
  selfieUrl?: string;
  userId?: string;
  email?: string;
}

export interface TestnetDeployment {
  network?: string;
  deployer?: string;
  issuer?: string;
  porOracle?: string;
  factory?: string;
  stockVault?: string;
  licitacion?: string;
  usdcSac?: string;
  xlmSac?: string;
  updatedAt?: string;
}

export type TestnetMode = 'local' | 'faucet' | 'deploy';

export interface TestnetSettings {
  mode: TestnetMode;
  friendbot: boolean;
  horizonUrl: string;
  rpcUrl: string;
  settlePolicy: SettlePolicy;
  settleAt?: string;
}

export interface TestnetAdminView extends Partial<TestnetSettings> {
  onChain?: boolean;
  deployment?: TestnetDeployment | null;
  activeIssuer?: string | null;
}

export interface DemoDossier {
  dossier: Record<string, string | number>;
  treasury: { publicKey: string; funded: boolean };
}

export interface DividendResult {
  id: string;
  totalUsdc: number;
  holdersPaid: number;
  perShare: number;
}

export interface NewStockInput {
  ticker: string;
  tokenTicker: string;
  companyName: string;
  isin: string;
  sector: string;
  priceUsdc: number;
  custodiedShares: number;
}

export type { PublicAccount };
