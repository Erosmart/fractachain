import { Keypair } from '@stellar/stellar-sdk';
import type { PublicAccount } from '@fractachain/shared';
import type { Account } from '../../domain/account/Account';
import type { IAccountRepository } from '../../domain/account/AccountRepository';
import { isStellarPublicKey } from '../../domain/stellar/StellarAddress';
import { DomainError, ValidationError, errorMessage } from '../../shared/errors';
import type { ILogger } from '../../shared/logger';
import type { IFriendbot } from '../../infrastructure/stellar/FriendbotClient';
import type { HorizonAccounts } from '../../infrastructure/stellar/HorizonAccounts';
import type { SdexGateway } from '../../infrastructure/stellar/SdexGateway';
import { SignedTransactionPolicy } from '../../infrastructure/stellar/SignedTransactionPolicy';
import { UsdcNeedsTrustlineError, type UsdcFaucet } from '../../infrastructure/stellar/UsdcFaucet';
import type { IWalletHydrator } from '../auth/AuthService';
import type { AccountService } from './AccountService';
import type { CustodialKeyService } from './CustodialKeyService';

export type UsdcFundingOutcome =
  | ({ status: 'FUNDED' } & Record<string, unknown>)
  | { status: 'NEED_TRUSTLINE'; xdr: string; publicKey: string };

/**
 * Wallet lifecycle: custody choice, testnet provisioning (Friendbot, XLM
 * top-up, USDC grant), balances and the custodial-key export.
 */
export class WalletService implements IWalletHydrator {
  /** Last successful heal per wallet: Friendbot + Horizon round-trips cost seconds. */
  private readonly healedAt = new Map<string, number>();
  private static readonly HEAL_INTERVAL_MS = 5 * 60_000;

  constructor(
    private readonly repo: IAccountRepository,
    private readonly accounts: AccountService,
    private readonly custody: CustodialKeyService,
    private readonly friendbot: IFriendbot,
    private readonly usdc: UsdcFaucet,
    private readonly horizon: HorizonAccounts,
    private readonly sdex: SdexGateway,
    private readonly logger: ILogger,
  ) {}

  /**
   * First custody choice (idempotent once set):
   * - `CUSTODIAL`: the platform generates and keeps the key (sealed).
   * - `SELF` without a key: a keypair is generated and its secret shown once,
   *   never stored.
   * Linking an *existing* wallet requires a signature (`/api/auth/wallet/link`):
   * v1 accepted any public key here without proof of ownership.
   */
  async chooseCustody(accountId: string, mode: 'CUSTODIAL' | 'SELF', publicKey?: string) {
    const account = this.accounts.require(accountId);
    if (publicKey) {
      throw new ValidationError('Para usar una wallet existente, vinculala firmando con Freighter');
    }
    let secretOnce: string | undefined;
    if (!account.custodyMode) {
      if (mode === 'CUSTODIAL') {
        this.custody.assignNewWallet(account);
      } else {
        const kp = Keypair.random();
        account.custodyMode = 'SELF';
        account.publicKey = kp.publicKey();
        secretOnce = kp.secret();
      }
      this.repo.save(account);
    }
    const user = (await this.hydrate(account.id).catch(() => undefined)) ?? this.accounts.toPublic(account);
    return { success: true as const, user, secretOnce };
  }

  /**
   * Makes a registered wallet usable on testnet: Friendbot, XLM refill and the
   * USDC trustline + grant (server-signed only for custodial wallets).
   */
  async hydrate(accountId: string): Promise<PublicAccount | undefined> {
    const account = this.accounts.get(accountId);
    if (!account) return undefined;
    if (account.custodyMode === 'CUSTODIAL' && !isStellarPublicKey(account.publicKey)) {
      this.custody.assignNewWallet(account);
    }
    if (!isStellarPublicKey(account.publicKey)) {
      this.repo.save(account);
      return this.accounts.toPublic(account);
    }
    if (!account.faucetFundedAt) {
      const faucet = await this.friendbot.fund(account.publicKey);
      if (faucet.funded) account.faucetFundedAt = new Date().toISOString();
    }
    await this.heal(account);
    account.xlmBalance = await this.horizon.nativeXlm(account.publicKey);
    this.repo.save(account);
    return this.accounts.toPublic(account);
  }

  /**
   * Best-effort XLM/USDC top-up; failures are logged, never thrown. Runs at
   * most once every 5 minutes per wallet (v1 hit Friendbot and Horizon on
   * every dashboard and wallet load).
   */
  async heal(account: Account, opts?: { force?: boolean }): Promise<void> {
    if (!isStellarPublicKey(account.publicKey)) return;
    const last = this.healedAt.get(account.publicKey) ?? 0;
    if (!opts?.force && Date.now() - last < WalletService.HEAL_INTERVAL_MS) return;
    // Recorded up front: a failing heal (e.g. faucet not configured) backs off too.
    this.healedAt.set(account.publicKey, Date.now());
    try {
      await this.usdc.ensureWalletFunded(account.publicKey, {
        walletSecret: this.custody.optionalSecretOf(account),
      });
    } catch (err) {
      this.logger.warn('auto-fondeo de wallet falló', { accountId: account.id, err: errorMessage(err) });
    }
  }

  /** Balances for the wallet page. Only the owner's own wallet triggers provisioning side effects. */
  async state(publicKey: string, caller?: Account) {
    if (!isStellarPublicKey(publicKey)) throw new ValidationError('Dirección Stellar inválida');
    if (caller && caller.publicKey === publicKey) await this.heal(caller);
    return this.usdc.walletFunds(publicKey);
  }

  /** Custodial secret export (the user owns these funds and may take them elsewhere). */
  exportSecret(accountId: string): string {
    return this.custody.secretFor(accountId);
  }

  /**
   * "Friendbot de USDC". Custodial wallets are funded inline; self-custody
   * gets an unsigned `changeTrust` to sign when it has no trustline yet.
   */
  async fundUsdc(accountId: string): Promise<UsdcFundingOutcome> {
    const account = this.accounts.require(accountId);
    if (!account.publicKey) throw new DomainError('La cuenta no tiene wallet de Stellar asociada');
    try {
      if (account.custodyMode === 'CUSTODIAL') {
        return {
          status: 'FUNDED',
          ...(await this.usdc.fund(account.publicKey, { walletSecret: this.custody.secretOf(account) })),
        };
      }
      return { status: 'FUNDED', ...(await this.usdc.payGrant(account.publicKey)) };
    } catch (err) {
      if (!(err instanceof UsdcNeedsTrustlineError)) throw err;
      const xdr = await this.sdex.buildTrustlineXdr(account.publicKey, this.usdc.asset());
      return { status: 'NEED_TRUSTLINE', xdr, publicKey: account.publicKey };
    }
  }

  /** Relays the wallet-signed USDC trustline (and nothing else), then pays the grant. */
  async submitUsdcTrustline(accountId: string, signedXdr: string) {
    const account = this.accounts.require(accountId);
    if (!account.publicKey) throw new DomainError('La cuenta no tiene wallet de Stellar asociada');
    const tx = this.sdex.parseTransaction(signedXdr);
    SignedTransactionPolicy.assertSourcedBy(tx, account.publicKey);
    SignedTransactionPolicy.assertTrustlineOnly(tx, this.usdc.asset());
    const relayed = await this.sdex.submitSigned(tx);
    const result = await this.usdc.payGrant(account.publicKey);
    return { status: 'FUNDED' as const, trustlineHash: relayed.hash || null, ...result };
  }
}
