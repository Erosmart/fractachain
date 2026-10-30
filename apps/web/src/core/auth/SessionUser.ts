import type { CustodyMode, Holding, KycStatus, PublicAccount } from '@fractachain/shared';

/**
 * The signed-in user as the UI sees it: the API's `PublicAccount` plus the
 * account-security flags (v2.1) and the legacy alias `custodialWallet` some
 * screens still read.
 */
export interface SessionUser extends PublicAccount {
  custodialWallet?: string;
  twoFactorEnabled: boolean;
  /** `false` only for email/password accounts that have not confirmed their address. */
  emailVerified: boolean;
}

type Raw = Record<string, unknown>;

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

function custodyOf(v: unknown): CustodyMode {
  return v === 'CUSTODIAL' || v === 'SELF' ? v : null;
}

function kycOf(v: unknown): KycStatus {
  return v === 'PENDING' || v === 'APPROVED' || v === 'REJECTED' || v === 'REVOKED' ? v : 'UNREGISTERED';
}

/**
 * Normalizes any user payload the API returns (`/api/auth/*`, `/api/listings/*`
 * responses embedding the user) into a {@link SessionUser}. Unknown or missing
 * fields degrade to safe defaults instead of `undefined` surprises in the UI.
 */
export function normalizeUser(input: unknown): SessionUser {
  const raw: Raw = input && typeof input === 'object' ? (input as Raw) : {};
  const publicKey = str(raw.publicKey) || str(raw.custodialWallet);
  return {
    id: str(raw.id) || str(raw.uid),
    email: str(raw.email),
    name: str(raw.legalName) || str(raw.name) || str(raw.displayName),
    avatar: str(raw.avatar) || str(raw.photoURL),
    publicKey,
    custodyMode: custodyOf(raw.custodyMode),
    kycStatus: kycOf(raw.kycStatus),
    kycId: str(raw.kycId) || undefined,
    legalName: str(raw.legalName) || undefined,
    cuit: str(raw.cuit) || undefined,
    selfieUrl: str(raw.selfieUrl) || undefined,
    custodialWallet: publicKey || undefined,
    authProvider: str(raw.authProvider) || undefined,
    holdings: Array.isArray(raw.holdings) ? (raw.holdings as Holding[]) : [],
    trustlines: Array.isArray(raw.trustlines)
      ? (raw.trustlines as unknown[]).filter((t): t is string => typeof t === 'string')
      : [],
    xlmBalance: num(raw.xlmBalance),
    faucetFunded: Boolean(raw.faucetFunded),
    isAdmin: Boolean(raw.isAdmin),
    twoFactorEnabled: raw.twoFactorEnabled === true,
    // Older API builds do not send the flag: never nag users about it then.
    emailVerified: raw.emailVerified !== false,
    uid: str(raw.uid) || undefined,
    createdAt: str(raw.createdAt) || undefined,
    // A cached user from an older build has no flag: the API's own gate still
    // applies (TERMS_REQUIRED), so don't send everyone to the Terms page.
    termsAccepted: raw.termsAccepted !== false,
    termsVersion: str(raw.termsVersion) || undefined,
    termsAcceptedAt: str(raw.termsAcceptedAt) || undefined,
  };
}
