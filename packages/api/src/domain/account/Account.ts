import type { CustodyMode, Holding, KycStatus, PublicAccount } from '@fractachain/shared';
import { DomainError, ForbiddenError } from '../../shared/errors';

export type { CustodyMode, Holding, KycStatus, PublicAccount };

/**
 * Persisted account record. `secretKey` is the custodial wallet secret sealed
 * with AES-256-GCM (`enc:` prefix); it never leaves the repository in clear
 * except through `CustodialKeyService`.
 */
export interface Account {
  id: string;
  email: string;
  name: string;
  avatar: string;
  /** `scrypt$…` (v2) or a legacy unsalted SHA-256 hex digest (v1, rehashed on next login). */
  passwordHash?: string;
  custodyMode: CustodyMode;
  publicKey: string;
  secretKey?: string;
  recoveryHint?: string;
  kycStatus: KycStatus;
  kycId?: string;
  legalName?: string;
  cuit?: string;
  selfiePath?: string;
  holdings: Holding[];
  trustlines: string[];
  cashUsdc: number;
  xlmBalance?: number;
  faucetFundedAt?: string;
  authProvider?: string;
  createdAt: string;
  lastLoginAt: string;
  /** Email confirmed by link (or by Google / by the operator for admins). */
  emailVerifiedAt?: string;
  /** TOTP second factor. Secrets are sealed like custodial keys. */
  twoFactor?: TwoFactorState;
  /** Epoch ms: sessions issued before this are rejected ("cerrar todas las sesiones", password reset). */
  sessionsRevokedAt?: number;
  /** Terms of Service + Privacy Policy acceptance (version = `LEGAL_VERSION` at the time). */
  termsAcceptedAt?: string;
  termsVersion?: string;
  /** Account closed by its owner: no login by any method, personal data minimized. */
  closedAt?: string;
}

export interface TwoFactorState {
  /** Sealed base32 secret, once enabled. */
  secret?: string;
  /** Sealed secret waiting for the first valid code. */
  pendingSecret?: string;
  enabledAt?: string;
  /** SHA-256 of each unused recovery code. */
  recoveryCodeHashes?: string[];
  /** Last accepted TOTP time step (replay protection). */
  lastUsedStep?: number;
}

export function hasTwoFactor(account: Account): boolean {
  return Boolean(account.twoFactor?.enabledAt && account.twoFactor.secret);
}

/** Google accounts come verified by Google; email accounts need the link. */
export function isEmailVerified(account: Account): boolean {
  return Boolean(account.emailVerifiedAt) || account.authProvider === 'firebase-google';
}

/** Synthetic email domain for wallet-only (Freighter) accounts. */
export const WALLET_EMAIL_DOMAIN = '@fractachain';

export function walletEmailFor(publicKey: string): string {
  return `wallet-${publicKey.toLowerCase()}${WALLET_EMAIL_DOMAIN}`;
}

export function isWalletEmail(email: string): boolean {
  return email.endsWith(WALLET_EMAIL_DOMAIN);
}

/** Shares the holder is economically entitled to: in wallet plus owed at close. */
export function economicShares(holding: Holding): number {
  return (holding.tokens || 0) + (holding.tokensOwed || 0);
}

export function findHolding(account: Account, listingId: string): Holding | undefined {
  return (account.holdings || []).find((h) => h.listingId === listingId);
}

export const DEFAULT_LEGAL_VERSION = '2026-10-30';
export const TERMS_REQUIRED_MESSAGE = 'Aceptá los Términos y la Política de privacidad para continuar.';

/**
 * Terms of Service / Privacy Policy acceptance. The current version is set
 * once at startup from `LEGAL_VERSION`; accepting an older version does not
 * count (a new version asks every user again).
 */
export class TermsPolicy {
  private static version = DEFAULT_LEGAL_VERSION;

  static configure(version: string): void {
    TermsPolicy.version = version || DEFAULT_LEGAL_VERSION;
  }

  static get current(): string {
    return TermsPolicy.version;
  }

  static accepted(account: Pick<Account, 'termsAcceptedAt' | 'termsVersion'>): boolean {
    return Boolean(account.termsAcceptedAt) && account.termsVersion === TermsPolicy.version;
  }

  static assertAccepted(account: Pick<Account, 'termsAcceptedAt' | 'termsVersion'>): void {
    if (!TermsPolicy.accepted(account)) throw new ForbiddenError(TERMS_REQUIRED_MESSAGE, 'TERMS_REQUIRED');
  }
}

export function isClosed(account: Pick<Account, 'closedAt'>): boolean {
  return Boolean(account.closedAt);
}

/**
 * Trading policy. Only KYC-approved investors with a wallet may subscribe,
 * trade, claim or collect dividends — the same gate the issuer enforces
 * on-chain with `AUTH_REQUIRED`.
 */
export class TraderPolicy {
  static assertCanTrade(account: Account): void {
    TermsPolicy.assertAccepted(account);
    if (account.kycStatus !== 'APPROVED') {
      throw new DomainError('Solo inversores con KYC aprobado pueden operar');
    }
    if (!account.custodyMode || !account.publicKey) {
      throw new DomainError('Primero creá la wallet');
    }
  }
}
