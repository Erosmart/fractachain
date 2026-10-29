import type { CustodyMode, Holding, KycStatus, PublicAccount } from '@fractachain/shared';
import { DomainError } from '../../shared/errors';

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

/**
 * Trading policy. Only KYC-approved investors with a wallet may subscribe,
 * trade, claim or collect dividends — the same gate the issuer enforces
 * on-chain with `AUTH_REQUIRED`.
 */
export class TraderPolicy {
  static assertCanTrade(account: Account): void {
    if (account.kycStatus !== 'APPROVED') {
      throw new DomainError('Solo inversores con KYC aprobado pueden operar');
    }
    if (!account.custodyMode || !account.publicKey) {
      throw new DomainError('Primero creá la wallet');
    }
  }
}
