import crypto from 'crypto';
import { isStellarPublicKey } from '../../domain/stellar/StellarAddress';
import type { Account } from '../../domain/account/Account';
import type { IAccountRepository } from '../../domain/account/AccountRepository';
import type { ILogger } from '../../shared/logger';
import type { IPasswordHasher } from '../../infrastructure/security/PasswordHasher';
import type { AdminPolicy } from './AdminPolicy';
import type { CustodialKeyService } from './CustodialKeyService';

export interface BootstrapOptions {
  adminBootstrapPassword?: string;
  seedDemoAccounts: boolean;
  hackathon: boolean;
}

const DEMO_ACCOUNT_EMAIL = 'test@fractachain.dev';
const DEMO_ACCOUNT_PASSWORD = 'test1234';

/**
 * Startup data tasks: admin accounts, demo seed, legacy migrations.
 *
 * Admin emails are *reserved* at boot. In v1 nobody verified email
 * ownership, so whoever registered an `ADMIN_EMAILS` address first became
 * admin; now that account exists from the first boot and only opens with the
 * bootstrap password (if configured) or a verified Google login.
 */
export class AccountBootstrapper {
  constructor(
    private readonly repo: IAccountRepository,
    private readonly admins: AdminPolicy,
    private readonly custody: CustodialKeyService,
    private readonly hasher: IPasswordHasher,
    private readonly options: BootstrapOptions,
    private readonly logger: ILogger,
  ) {}

  async run(): Promise<void> {
    const sealed = this.custody.sealLegacySecrets();
    if (sealed) this.logger.warn('secretos custodiales en texto plano migrados a AES-GCM', { sealed });

    await this.reserveAdminAccounts();
    for (const account of this.repo.list()) this.ensureAdminPrivileges(account);
    if (this.options.seedDemoAccounts) await this.seedDemoAccount();

    for (const account of this.repo.list()) {
      // Sandbox cash is play money for the demo market: keep every account able to trade.
      if (typeof account.cashUsdc !== 'number' || account.cashUsdc < 15_000) account.cashUsdc = 50_000;
      if (this.options.hackathon && (account.kycStatus === 'UNREGISTERED' || account.kycStatus === 'PENDING')) {
        account.kycStatus = 'APPROVED';
      }
    }
    this.repo.save();
  }

  /** Admins always have a custodial wallet and an approved KYC. Mutates; caller persists. */
  ensureAdminPrivileges(account: Account): void {
    if (!this.admins.isAdminEmail(account.email)) return;
    if (!account.custodyMode || !isStellarPublicKey(account.publicKey)) this.custody.assignNewWallet(account);
    account.kycStatus = 'APPROVED';
    account.legalName = account.legalName || account.name || 'Admin';
    account.kycId = account.kycId || `kyc-${account.id}`;
    if (typeof account.cashUsdc !== 'number' || account.cashUsdc < 15_000) account.cashUsdc = 50_000;
  }

  private async reserveAdminAccounts(): Promise<void> {
    for (const email of this.admins.adminEmails()) {
      let account = this.repo.findByEmail(email);
      if (!account) {
        const now = new Date().toISOString();
        account = {
          id: `usr_${crypto.randomBytes(8).toString('hex')}`,
          email,
          name: email.split('@')[0],
          avatar: '',
          custodyMode: null,
          publicKey: '',
          kycStatus: 'APPROVED',
          holdings: [],
          trustlines: [],
          cashUsdc: 50_000,
          authProvider: 'email',
          createdAt: now,
          lastLoginAt: now,
        };
        this.repo.insert(account);
        this.logger.info('cuenta admin reservada', { email });
      }
      if (!account.passwordHash && this.options.adminBootstrapPassword) {
        account.passwordHash = await this.hasher.hash(this.options.adminBootstrapPassword);
        this.logger.info('contraseña inicial de admin aplicada', { email });
      }
    }
  }

  /** Fixed account to walk the first-time flow (login → custody → KYC). Local/demo only. */
  private async seedDemoAccount(): Promise<void> {
    if (this.repo.findByEmail(DEMO_ACCOUNT_EMAIL)) return;
    const now = new Date().toISOString();
    this.repo.insert({
      id: `usr_test_${crypto.randomBytes(3).toString('hex')}`,
      email: DEMO_ACCOUNT_EMAIL,
      name: 'Cuenta de prueba',
      avatar: '',
      passwordHash: await this.hasher.hash(DEMO_ACCOUNT_PASSWORD),
      custodyMode: null,
      publicKey: '',
      kycStatus: 'UNREGISTERED',
      holdings: [],
      trustlines: [],
      cashUsdc: 50_000,
      authProvider: 'email',
      createdAt: now,
      lastLoginAt: now,
    });
    this.logger.warn('cuenta demo sembrada (DEMO_SEED_ACCOUNTS)', { email: DEMO_ACCOUNT_EMAIL });
  }
}
