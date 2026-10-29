import { z } from 'zod';

/**
 * Request DTOs. Every body is parsed here before reaching a service: unknown
 * keys are stripped (no mass assignment), strings are length-capped and
 * numbers coerced, so services only ever see well-formed input.
 */

const str = (max: number) => z.string().trim().max(max);
const optStr = (max: number) => z.string().trim().max(max).optional();
const num = z.coerce.number().refine(Number.isFinite, 'Número inválido');
const positive = num.refine((n) => n > 0, 'Tiene que ser mayor a cero');
const side = z.enum(['BUY', 'SELL']);
const settlePolicy = z.enum(['ON_MIN', 'ON_DATE']);
const xdr = z.string().trim().min(1, 'Falta el XDR firmado').max(20_000);
const stellarKey = z
  .string()
  .trim()
  .regex(/^G[A-Z2-7]{55}$/, 'Dirección Stellar inválida');
const httpUrl = z
  .string()
  .trim()
  .url()
  .refine((u) => /^https?:\/\//.test(u), 'Solo URLs http(s)');

/* ------------------------------- params ------------------------------- */

export const IdParam = z.object({ id: z.string().regex(/^[A-Za-z0-9_.:-]{1,120}$/, 'Id inválido') });
export const ListingIdParam = z.object({
  listingId: z.string().regex(/^[A-Za-z0-9_.:-]{1,120}$/, 'Id inválido'),
});
export const TickerParam = z.object({ ticker: z.string().regex(/^[A-Za-z0-9]{1,12}$/, 'Ticker inválido') });
export const CropParam = z.object({ crop: z.string().regex(/^[a-zA-Z]{1,30}$/, 'Cultivo inválido') });

/* -------------------------------- auth -------------------------------- */

export const EmailLoginBody = z.object({
  email: str(254),
  password: z.string().max(256),
  name: optStr(120),
});

export const FirebaseLoginBody = z.object({ idToken: z.string().max(8_000).optional() });

export const WalletSignatureBody = z.object({
  publicKey: str(56),
  message: str(80),
  signature: str(200),
});

/** 6-digit TOTP or a `XXXXX-XXXXX` recovery code. */
export const CodeBody = z.object({ code: str(16).min(6, 'Código inválido') });
export const TwoFactorVerifyBody = z.object({
  challenge: str(2_000).min(1),
  code: str(16).min(6, 'Código inválido'),
});
export const TokenBody = z.object({ token: str(2_000).min(1, 'Falta el token') });
export const ForgotPasswordBody = z.object({ email: str(254).min(3) });
export const ResetPasswordBody = z.object({
  token: str(2_000).min(1, 'Falta el token'),
  password: z.string().max(256),
});

export const AuditQuery = z.object({
  limit: z.coerce.number().int().min(1).max(1_000).optional(),
  action: optStr(80),
  actor: optStr(120),
});

export const CustodyBody = z.object({
  mode: z.enum(['CUSTODIAL', 'SELF'], { message: 'Modo inválido' }),
  publicKey: optStr(56),
});

/* --------------------------------- KYC --------------------------------- */

export const OnboardingKycBody = z.object({
  legalName: str(200),
  cuit: str(20),
  /** ~5 MB image as base64 data URL. */
  selfieDataUrl: z.string().max(7_500_000).optional(),
  email: optStr(254),
});

export const KycRegisterBody = z.object({
  id: optStr(80),
  userId: optStr(80),
  fullName: str(200).min(1),
  documentNumber: str(40),
  taxId: optStr(40),
  countryCode: z.coerce.number().int().min(0).max(999),
  countryName: str(80),
  address: str(300),
  investorType: z.enum(['National', 'Foreign', 'Qualified', 'Institutional']),
  stellarAddress: str(56),
  documentFrontUrl: str(500).default(''),
  documentBackUrl: optStr(500),
  selfieUrl: str(500).default(''),
});

export const ReasonBody = z.object({ reason: optStr(500) });

/* -------------------------------- wallet ------------------------------- */

export const XdrBody = z.object({ xdr });

export const WalletStateQuery = z.object({ account: str(56).optional() });

/* -------------------------------- mocks -------------------------------- */

export const ArsOnRampBody = z.object({ arsAmount: positive, destinationWallet: str(120).min(1) });
export const FiatOnRampBody = z.object({
  fiatAmount: positive,
  fiatCurrency: z.enum(['USD', 'EUR', 'GBP', 'BRL']).default('USD'),
  destinationWallet: str(120).min(1),
});
export const CctpBody = z.object({
  originChain: z.enum(['ethereum', 'arbitrum', 'base', 'solana', 'polygon']),
  usdcAmount: positive,
  destinationWallet: str(120).min(1),
});
export const NearIntentsBody = z.object({
  depositAsset: z.enum(['BTC', 'ETH', 'SOL', 'USDT']),
  depositAmount: positive,
  destinationWallet: str(120).min(1),
});

/* ---------------------------- admin: catalog ---------------------------- */

export const CreateStockBody = z.object({
  ticker: str(12),
  tokenTicker: optStr(12),
  companyName: str(200),
  isin: str(20),
  sector: optStr(80),
  priceUsdc: positive,
  custodiedShares: positive,
  custodianCuit: optStr(20),
});
export const StockActiveBody = z.object({ active: z.coerce.boolean() });
export const StockPriceBody = z.object({ priceUsdc: positive, change24hPct: num.optional() });

const paymentKind = z.enum(['XLM', 'USDC', 'USDT']);
export const PaymentAssetBody = z.object({
  kind: paymentKind,
  address: z
    .string()
    .trim()
    .regex(/^(native|C[A-Z2-7]{55})$/, 'Dirección de contrato inválida'),
});
export const CreateProductBody = z.object({
  kind: z.enum(['LICITACION', 'FORWARD', 'WARRANT', 'STOCK']),
  name: str(200).min(1),
  paymentKind,
  pricePerUnit: optStr(40),
  contractAddress: optStr(56),
  notes: optStr(1000),
});
export const ProductPriceBody = z.object({
  pricePerUnit: z.union([z.string().trim().max(40), z.number()]).transform(String),
});
export const ProductBindBody = z.object({ contractAddress: str(56).min(1, 'contractAddress requerido') });

/* -------------------------------- listings ------------------------------- */

export const DossierBody = z.object({
  legalName: str(200),
  tradeName: str(200).default(''),
  cuit: str(20),
  jurisdiction: str(80).default('Argentina'),
  sector: str(80).default(''),
  ticker: str(12).regex(/^[A-Za-z0-9]*$/, 'Ticker alfanumérico'),
  tokenTicker: str(12).regex(/^[A-Za-z0-9]*$/, 'Token ticker alfanumérico'),
  isin: str(20),
  authorizedShares: num.default(0),
  sharesToTokenize: num,
  pricePerShareUsdc: num,
  cajaSubaccount: str(80),
  custodianCuit: str(20),
  cnvRecordId: str(80),
  bymaRequestId: str(80).default(''),
  legalTermsUri: str(500),
  estatutoHash: str(128),
  auditor: str(200),
  issuerPublicKey: str(56).default(''),
  proceedsWallet: str(56),
  paymentKind: paymentKind.default('USDC'),
  offeringSoftCapUsdc: num.default(0),
  offeringHardCapUsdc: num,
  offeringDays: num.default(30),
  tnaUsd: num.default(0),
  useOfProceeds: str(2000).default(''),
  minInvestmentUsdc: num.optional(),
});

export const MintBody = z.object({ amount: positive });
export const SettleBody = z.object({ settlePolicy: settlePolicy.optional(), settleAt: optStr(40) });
export const ProceedsWalletBody = z.object({ wallet: stellarKey });
export const DividendBody = z
  .object({ amountUsdc: positive.optional(), amount: positive.optional() })
  .refine((b) => b.amountUsdc !== undefined || b.amount !== undefined, 'Falta el monto');
export const ContributeBody = z.object({ usdcAmount: positive });
export const ContributeSubmitBody = z.object({ xdr, usdcAmount: num.optional() });

/* -------------------------------- trading -------------------------------- */

export const SandboxOrderBody = z.object({ side, price: positive, amount: positive });
export const SdexOrderBody = z.object({ side, price: positive, quantity: positive, offerId: optStr(30) });
export const SdexCancelBody = z.object({
  side,
  offerId: z
    .union([
      z
        .string()
        .trim()
        .regex(/^\d{1,20}$/),
      z.number().int().nonnegative(),
    ])
    .transform(String),
  price: positive,
  legacy: z.coerce.boolean().optional(),
});
export const TrustlinePrepareBody = z.object({ limit: positive.optional() });

/* -------------------------------- admin ops ------------------------------- */

export const ComplianceSyncBody = z.object({ address: stellarKey, approved: z.coerce.boolean() });
export const ConfigureIssuerBody = z.object({ clawback: z.coerce.boolean().optional() });
export const NetworkSettingsBody = z.object({
  mode: z.enum(['local', 'faucet', 'deploy']).optional(),
  friendbot: z.coerce.boolean().optional(),
  horizonUrl: httpUrl.optional(),
  rpcUrl: httpUrl.optional(),
  networkPassphrase: optStr(120),
  notes: optStr(1000),
  settlePolicy: settlePolicy.optional(),
  settleAt: optStr(40),
});
