import {
  TraderPolicy,
  economicShares,
  findHolding,
  hasTwoFactor,
  isEmailVerified,
  type Account,
  type Holding,
  type KycStatus,
  type PublicAccount,
} from '../../domain/account/Account';
import type { IAccountRepository } from '../../domain/account/AccountRepository';
import { DomainError, NotFoundError } from '../../shared/errors';
import { EPSILON, round6 } from '../../shared/numbers';
import type { AdminPolicy } from './AdminPolicy';

/**
 * The platform ledger per investor: holdings, sandbox cash, trustline
 * opt-ins and pending dividends. Every mutation goes through here so the
 * invariants (KYC gate, no double claim, no negative balances) live in one
 * place.
 */
export class AccountService {
  constructor(
    private readonly accounts: IAccountRepository,
    private readonly admins: AdminPolicy,
  ) {}

  get(id: string): Account | undefined {
    return this.accounts.findById(id);
  }

  require(id: string): Account {
    const account = this.accounts.findById(id);
    if (!account) throw new NotFoundError('Cuenta no encontrada');
    return account;
  }

  list(): Account[] {
    return this.accounts.list();
  }

  findByPublicKey(publicKey: string): Account | undefined {
    return this.accounts.findByPublicKey(publicKey);
  }

  isAdmin(account: Pick<Account, 'email'>): boolean {
    return this.admins.isAdminEmail(account.email);
  }

  /** The only account shape that leaves the API — no hashes, no sealed secrets, no file paths. */
  toPublic(a: Account): PublicAccount {
    return {
      id: a.id,
      email: a.email,
      name: a.name,
      avatar: a.avatar,
      custodyMode: a.custodyMode,
      publicKey: a.publicKey,
      kycStatus: a.kycStatus,
      kycId: a.kycId,
      legalName: a.legalName,
      cuit: a.cuit,
      selfieUrl: a.selfiePath ? `/api/kyc/selfie/${a.id}` : undefined,
      holdings: a.holdings || [],
      cashUsdc: a.cashUsdc ?? 0,
      trustlines: a.trustlines || [],
      xlmBalance: a.xlmBalance ?? 0,
      faucetFunded: Boolean(a.faucetFundedAt),
      isAdmin: this.isAdmin(a),
      twoFactorEnabled: hasTwoFactor(a),
      emailVerified: isEmailVerified(a),
      uid: a.id,
      authProvider: a.authProvider,
      createdAt: a.createdAt,
    };
  }

  publicById(id: string): PublicAccount {
    return this.toPublic(this.require(id));
  }

  setKycStatus(accountId: string, status: KycStatus): PublicAccount {
    const account = this.require(accountId);
    account.kycStatus = status;
    this.accounts.save(account);
    return this.toPublic(account);
  }

  hasTrustline(accountId: string, listingId: string): boolean {
    return Boolean(this.get(accountId)?.trustlines?.includes(listingId));
  }

  /** Records the investor's opt-in to hold a listing's token. */
  addTrustline(accountId: string, listingId: string): PublicAccount {
    const account = this.require(accountId);
    TraderPolicy.assertCanTrade(account);
    account.trustlines = account.trustlines || [];
    if (!account.trustlines.includes(listingId)) account.trustlines.push(listingId);
    this.accounts.save(account);
    return this.toPublic(account);
  }

  /** Moves `tokensOwed → tokens` once the offering closed successfully. */
  claimListingTokens(accountId: string, listingId: string, listingClosed: boolean): PublicAccount {
    const account = this.require(accountId);
    TraderPolicy.assertCanTrade(account);
    if (!listingClosed) throw new DomainError('La licitación todavía no cerró');
    if (!this.hasTrustline(accountId, listingId)) {
      throw new DomainError('Primero aprobá el token (trustline) para poder recibirlo');
    }
    const holding = findHolding(account, listingId);
    if (!holding || (holding.tokensOwed || 0) <= 0) throw new DomainError('No hay tokens pendientes de reclamo');
    if (holding.refundedAt) throw new DomainError('Ese aporte ya se reembolsó on-chain; no hay unidades para anotar');
    holding.tokens += holding.tokensOwed;
    holding.tokensOwed = 0;
    this.accounts.save(account);
    return this.toPublic(account);
  }

  markHoldingRefunded(accountId: string, listingId: string, hash?: string | null): PublicAccount {
    const account = this.require(accountId);
    const holding = findHolding(account, listingId);
    if (!holding) throw new DomainError('No hay una posición en esta licitación');
    if (holding.refundedAt) throw new DomainError('Este aporte ya está marcado como reembolsado');
    holding.tokens = 0;
    holding.tokensOwed = 0;
    holding.refundedAt = new Date().toISOString();
    if (hash) holding.refundHash = hash;
    this.accounts.save(account);
    return this.toPublic(account);
  }

  markTokensOnChain(accountId: string, listingId: string, amount: number): PublicAccount {
    const account = this.require(accountId);
    const holding = findHolding(account, listingId);
    if (!holding) throw new NotFoundError('Tenencia no encontrada');
    holding.tokensOnChain = (holding.tokensOnChain || 0) + amount;
    this.accounts.save(account);
    return this.toPublic(account);
  }

  addHolding(accountId: string, holding: Holding): PublicAccount {
    const account = this.require(accountId);
    account.holdings = account.holdings || [];
    const existing = findHolding(account, holding.listingId);
    if (existing) {
      existing.usdcAmount += holding.usdcAmount;
      existing.tokens += holding.tokens;
      existing.tokensOwed = (existing.tokensOwed || 0) + (holding.tokensOwed || 0);
    } else {
      account.holdings.push({
        ...holding,
        tokensOwed: holding.tokensOwed || 0,
        pendingDividendUsdc: holding.pendingDividendUsdc || 0,
      });
    }
    this.accounts.save(account);
    return this.toPublic(account);
  }

  reduceHolding(accountId: string, listingId: string, tokens: number): void {
    const account = this.require(accountId);
    const holding = findHolding(account, listingId);
    if (!holding || holding.tokens + EPSILON < tokens) throw new DomainError('No hay tokens suficientes para vender');
    const ratio = tokens / holding.tokens;
    holding.tokens -= tokens;
    holding.usdcAmount = Math.max(0, holding.usdcAmount * (1 - ratio));
    if (holding.tokens <= 1e-8 && (holding.tokensOwed || 0) <= 1e-8) {
      account.holdings = account.holdings.filter((h) => h.listingId !== listingId);
    }
    this.accounts.save(account);
  }

  debitCash(accountId: string, amount: number): void {
    const account = this.require(accountId);
    if (account.cashUsdc + EPSILON < amount) throw new DomainError('USDC insuficiente en el saldo sandbox');
    account.cashUsdc = round6(account.cashUsdc - amount);
    this.accounts.save(account);
  }

  creditCash(accountId: string, amount: number): void {
    const account = this.require(accountId);
    account.cashUsdc = round6(account.cashUsdc + amount);
    this.accounts.save(account);
  }

  tokenBalance(accountId: string, listingId: string): number {
    const account = this.get(accountId);
    return (account && findHolding(account, listingId)?.tokens) || 0;
  }

  cashBalance(accountId: string): number {
    return this.get(accountId)?.cashUsdc || 0;
  }

  accrueDividend(accountId: string, listingId: string, usdc: number): void {
    const account = this.get(accountId);
    const holding = account && findHolding(account, listingId);
    if (!account || !holding) return;
    holding.pendingDividendUsdc = round6((holding.pendingDividendUsdc || 0) + usdc);
    this.accounts.save(account);
  }

  claimPendingDividend(accountId: string, listingId: string): { amount: number; user: PublicAccount } {
    const account = this.require(accountId);
    TraderPolicy.assertCanTrade(account);
    const holding = findHolding(account, listingId);
    const amount = round6(holding?.pendingDividendUsdc || 0);
    if (!holding || amount <= 0) throw new DomainError('No hay dividendos pendientes de cobro');
    holding.pendingDividendUsdc = 0;
    account.cashUsdc = round6(account.cashUsdc + amount);
    this.accounts.save(account);
    return { amount, user: this.toPublic(account) };
  }

  /** Holders of a listing with their economic shares (wallet + owed). */
  holdersOf(listingId: string): { accountId: string; shares: number }[] {
    return this.accounts
      .list()
      .map((a) => {
        const holding = findHolding(a, listingId);
        return { accountId: a.id, shares: holding ? economicShares(holding) : 0 };
      })
      .filter((h) => h.shares > 0);
  }

  save(account: Account): void {
    this.accounts.save(account);
  }
}
