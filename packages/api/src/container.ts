/**
 * Composition root — the only place that knows concrete classes.
 *
 * Everything else depends on constructor-injected collaborators (mostly
 * interfaces), so swapping an implementation (Postgres-only storage, another
 * KYC provider, a mock chain in tests) is a change here and nowhere else.
 */
import type { Express } from 'express';
import { Pool } from 'pg';
import type { AppConfig } from './config/env';
import { AccountBootstrapper } from './application/account/AccountBootstrapper';
import { AccountService } from './application/account/AccountService';
import { AdminPolicy } from './application/account/AdminPolicy';
import { CustodialKeyService } from './application/account/CustodialKeyService';
import { WalletService } from './application/account/WalletService';
import { AuditTrail } from './application/audit/AuditTrail';
import { AuthService } from './application/auth/AuthService';
import { ComplianceService } from './application/compliance/ComplianceService';
import { StockCatalogService } from './application/custody/StockCatalogService';
import { DemoDossierService } from './application/demo/DemoDossierService';
import { IssuanceProductService } from './application/issuance/IssuanceProductService';
import { AccountPrivacyService, type ICustodialFunds } from './application/account/AccountPrivacyService';
import { MailSecurityNotices } from './application/security/SecurityNotices';
import { SupportService } from './application/support/SupportService';
import { TermsPolicy } from './domain/account/Account';
import { AccountController } from './http/controllers/AccountController';
import { SupportController } from './http/controllers/SupportController';
import {
  JsonSupportRepository,
  SUPPORT_KEY,
} from './infrastructure/persistence/repositories/JsonSupportRepository';
import { HorizonCustodialFunds } from './infrastructure/stellar/CustodialFunds';
import { createChainModule } from './modules/chain';
import { createTxModule } from './modules/tx';
import { TX_BUILDS_KEY } from './application/tx/TxBuildStore';
import type { ModuleDeps } from './modules/types';
import { IdentityVerificationService } from './application/kyc/IdentityVerificationService';
import { KycService } from './application/kyc/KycService';
import { DiditClient, DiditWebhookAuthenticator } from './infrastructure/kyc/DiditClient';
import type { IIdentityVerificationProvider } from './domain/kyc/IdentityVerification';
import { IssuanceWorkflowService } from './application/listing/IssuanceWorkflowService';
import { ListingLedger } from './application/listing/ListingLedger';
import { ListingPresenter } from './application/listing/ListingPresenter';
import { DividendService } from './application/market/DividendService';
import { PortfolioService } from './application/market/PortfolioService';
import { SandboxOrderBookService } from './application/market/SandboxOrderBookService';
import { SdexMarketService } from './application/market/SdexMarketService';
import { MockGatewayService } from './application/mocks/MockGatewayService';
import { OfferingService } from './application/offering/OfferingService';
import { OnChainStatusService } from './application/offering/OnChainStatusService';
import { SettlementService } from './application/settlement/SettlementService';
import { EmailVerificationService } from './application/security/EmailVerificationService';
import { PasswordResetService } from './application/security/PasswordResetService';
import { TwoFactorService } from './application/security/TwoFactorService';
import { NetworkAdminService } from './application/testnet/NetworkAdminService';
import type { NetworkSettings } from './domain/testnet/NetworkSettings';
import { createApp } from './http/app';
import { AdminOpsController } from './http/controllers/AdminOpsController';
import { AuthController } from './http/controllers/AuthController';
import { CatalogController } from './http/controllers/CatalogController';
import { HealthController } from './http/controllers/HealthController';
import { KycController } from './http/controllers/KycController';
import { ListingController } from './http/controllers/ListingController';
import { MarketController } from './http/controllers/MarketController';
import { WalletController } from './http/controllers/WalletController';
import { AuditMiddleware } from './http/middleware/AuditMiddleware';
import { AuthMiddleware } from './http/middleware/AuthMiddleware';
import { RateLimiters } from './http/middleware/rateLimiters';
import { SessionCookie } from './http/SessionCookie';
import { LogMailer, SmtpMailer, type IMailer } from './infrastructure/mail/Mailer';
import type { IDocumentStore, IFlushable } from './infrastructure/persistence/DocumentStore';
import { JsonFileDocumentStore } from './infrastructure/persistence/JsonFileDocumentStore';
import { PostgresMirroredStore } from './infrastructure/persistence/PostgresMirroredStore';
import {
  AUDIT_KEY,
  JsonAuditRepository,
} from './infrastructure/persistence/repositories/JsonAuditRepository';
import {
  ACCOUNTS_KEY,
  JsonAccountRepository,
} from './infrastructure/persistence/repositories/JsonAccountRepository';
import {
  DIVIDENDS_KEY,
  JsonDividendRepository,
} from './infrastructure/persistence/repositories/JsonDividendRepository';
import {
  CONTRIBUTIONS_KEY,
  JsonContributionLog,
} from './infrastructure/persistence/repositories/JsonContributionLog';
import {
  JsonKycRecordRepository,
  KYC_KEY,
} from './infrastructure/persistence/repositories/JsonKycRecordRepository';
import {
  JsonListingRepository,
  LISTINGS_KEY,
} from './infrastructure/persistence/repositories/JsonListingRepository';
import {
  JsonNetworkSettingsRepository,
  NETWORK_SETTINGS_KEY,
} from './infrastructure/persistence/repositories/JsonNetworkSettingsRepository';
import {
  JsonSandboxBookRepository,
  ORDERBOOK_KEY,
} from './infrastructure/persistence/repositories/JsonSandboxBookRepository';
import {
  JsonStockRepository,
  STOCKS_KEY,
} from './infrastructure/persistence/repositories/JsonStockRepository';
import { FirebaseTokenVerifier } from './infrastructure/security/FirebaseTokenVerifier';
import { ScryptPasswordHasher } from './infrastructure/security/PasswordHasher';
import { AesGcmSecretCipher } from './infrastructure/security/SecretCipher';
import { SignedTokenCodec } from './infrastructure/security/SignedTokens';
import { TotpService } from './infrastructure/security/Totp';
import { HmacTokenService, PersistentRevocationList } from './infrastructure/security/TokenService';
import { Sep53WalletSignatureVerifier } from './infrastructure/security/WalletSignatureVerifier';
import { FileDeploymentRegistry } from './infrastructure/stellar/DeploymentRegistry';
import { Explorer } from './infrastructure/stellar/Explorer';
import { FriendbotClient } from './infrastructure/stellar/FriendbotClient';
import { HorizonAccounts } from './infrastructure/stellar/HorizonAccounts';
import { LicitacionContract } from './infrastructure/stellar/LicitacionContract';
import { PlatformKeyring } from './infrastructure/stellar/PlatformKeyring';
import { SdexGateway } from './infrastructure/stellar/SdexGateway';
import { EnvFileSecretStore, type ISecretStore } from './infrastructure/stellar/SecretStore';
import { SorobanGateway } from './infrastructure/stellar/SorobanGateway';
import { StellarClients } from './infrastructure/stellar/StellarClients';
import { StockVaultContract } from './infrastructure/stellar/StockVaultContract';
import { UsdcFaucet } from './infrastructure/stellar/UsdcFaucet';
import { LocalSelfieStorage } from './infrastructure/storage/SelfieStorage';
import { SettlementSweepJob } from './jobs/SettlementSweepJob';
import { SystemClock, type IClock } from './shared/clock';
import {
  InProcessLockProvider,
  PostgresAdvisoryLockProvider,
  type ILockProvider,
} from './shared/LockProvider';
import type { ILogger } from './shared/logger';

/** Documents mirrored to Postgres (and restored from it on boot). */
export const PERSISTED_DOCUMENTS: ReadonlySet<string> = new Set([
  ACCOUNTS_KEY,
  LISTINGS_KEY,
  ORDERBOOK_KEY,
  DIVIDENDS_KEY,
  NETWORK_SETTINGS_KEY,
  STOCKS_KEY,
  KYC_KEY,
  AUDIT_KEY,
  CONTRIBUTIONS_KEY,
  TX_BUILDS_KEY,
  SUPPORT_KEY,
  'revoked-sessions.json',
]);

export interface ContainerOverrides {
  store?: IDocumentStore;
  secrets?: ISecretStore;
  clock?: IClock;
  mailer?: IMailer;
  /** Replaces the Horizon balance read used before closing a custodial account (tests). */
  custodialFunds?: ICustodialFunds;
  /** Replaces the Didit client (tests). Needs DIDIT_* in the config to take effect end to end. */
  identityProvider?: IIdentityVerificationProvider;
}

export interface Container {
  app: Express;
  bootstrap: AccountBootstrapper;
  sweep: SettlementSweepJob;
  services: {
    auth: AuthService;
    accounts: AccountService;
    wallets: WalletService;
    kyc: KycService;
    listings: ListingLedger;
    offerings: OfferingService;
    settlement: SettlementService;
    twoFactor: TwoFactorService;
    audit: AuditTrail;
  };
  close(): Promise<void>;
}

async function createStore(
  config: AppConfig,
  logger: ILogger,
): Promise<IDocumentStore & Partial<IFlushable> & { close?: () => Promise<void> }> {
  const local = new JsonFileDocumentStore(config.storage.dataDir, logger.child({ component: 'store' }));
  if (!config.storage.databaseUrl) return local;
  const mirrored = PostgresMirroredStore.connect(
    local,
    config.storage.databaseUrl,
    PERSISTED_DOCUMENTS,
    logger.child({ component: 'pg' }),
  );
  await mirrored.restore();
  return mirrored;
}

export async function buildContainer(
  config: AppConfig,
  logger: ILogger,
  overrides: ContainerOverrides = {},
): Promise<Container> {
  // One legal version for the whole process (TraderPolicy and friends check it).
  TermsPolicy.configure(config.legal.version);
  const store = overrides.store ?? (await createStore(config, logger));
  const clock = overrides.clock ?? new SystemClock();

  /* -------------------------------- repositories -------------------------------- */
  const accountRepo = new JsonAccountRepository(store);
  const listingRepo = new JsonListingRepository(store);
  const kycRepo = new JsonKycRecordRepository(store);
  const bookRepo = new JsonSandboxBookRepository(store);
  const dividendRepo = new JsonDividendRepository(store);
  const stockRepo = new JsonStockRepository(store);
  const auditRepo = new JsonAuditRepository(store);
  const networkDefaults: NetworkSettings = {
    mode: 'deploy',
    friendbot: config.stellar.isTestnet,
    horizonUrl: config.stellar.horizonUrl,
    rpcUrl: config.stellar.rpcUrl,
    networkPassphrase: config.stellar.networkPassphrase,
    notes: 'Testnet. Friendbot fondea XLM. Los IDs públicos de contratos están en deployments/testnet.json.',
    settlePolicy: 'ON_MIN',
    updatedAt: clock.isoNow(),
  };
  const networkSettings = new JsonNetworkSettingsRepository(store, networkDefaults);

  /* ------------------------------- infrastructure ------------------------------- */
  const deployments = new FileDeploymentRegistry(config.stellar.deploymentFile);
  const clients = new StellarClients(networkSettings);
  const friendbot = new FriendbotClient(config.stellar.friendbotUrl, clients);
  const secrets =
    overrides.secrets ??
    new EnvFileSecretStore(config.storage.envFile, logger.child({ component: 'secrets' }));
  const keyring = new PlatformKeyring(
    secrets,
    deployments,
    friendbot,
    config.stellar.isTestnet,
    logger.child({ component: 'keyring' }),
  );
  const explorer = new Explorer(config.stellar.explorerUrl);
  const horizon = new HorizonAccounts(clients, keyring, config.stellar.xlmFloor, config.stellar.xlmTopUp);
  const sdex = new SdexGateway(clients, keyring);
  const soroban = new SorobanGateway(clients, deployments);
  const usdc = new UsdcFaucet(
    config.stellar.usdcCode,
    config.stellar.usdcGrant,
    keyring,
    sdex,
    horizon,
    friendbot,
    deployments,
    explorer,
    {
      mode: config.stellar.usdcMode,
      isTestnet: config.stellar.isTestnet,
      networkPassphrase: config.stellar.networkPassphrase,
      poolGrant: config.stellar.usdcPoolGrant,
    },
  );
  const licitacion = new LicitacionContract(
    soroban,
    keyring,
    deployments,
    horizon,
    usdc,
    logger.child({ component: 'licitacion' }),
  );
  const stockVault = new StockVaultContract(soroban, keyring, deployments);

  const cipher = new AesGcmSecretCipher(config.auth.walletPepper, config.auth.walletPepperPrevious);
  const hasher = new ScryptPasswordHasher();
  const tokens = new HmacTokenService(
    config.auth.tokenSecret,
    config.auth.sessionTtlMs,
    new PersistentRevocationList(store, clock),
    clock,
  );
  const identity = new FirebaseTokenVerifier(config.auth.firebaseProjectId);
  const walletSignatures = new Sep53WalletSignatureVerifier(clock);
  const selfies = new LocalSelfieStorage(config.storage.dataDir);
  const linkTokens = new SignedTokenCodec(config.auth.tokenSecret, clock);
  const totp = new TotpService('Fractachain', () => clock.now());
  const mailer =
    overrides.mailer ??
    (config.mail.smtpUrl
      ? new SmtpMailer(config.mail.smtpUrl, config.mail.from)
      : new LogMailer(logger.child({ component: 'mail' })));
  // Payout/contribution locks: Postgres advisory locks when replicas share a database.
  const lockPool = config.storage.databaseUrl
    ? new Pool({ connectionString: config.storage.databaseUrl, max: 4 })
    : null;
  const locks: ILockProvider = lockPool
    ? new PostgresAdvisoryLockProvider(lockPool)
    : new InProcessLockProvider();

  /* --------------------------------- application --------------------------------- */
  const admins = new AdminPolicy(config.auth.adminEmails);
  const accounts = new AccountService(accountRepo, admins);
  const custody = new CustodialKeyService(accountRepo, cipher);
  const bootstrap = new AccountBootstrapper(
    accountRepo,
    admins,
    custody,
    hasher,
    {
      adminBootstrapPassword: config.auth.adminBootstrapPassword,
      seedDemoAccounts: config.demo.seedAccounts,
      hackathon: config.demo.hackathon,
    },
    logger.child({ component: 'bootstrap' }),
  );
  const listings = new ListingLedger(
    listingRepo,
    accounts,
    networkSettings,
    {
      platformIssuerPublicKey: () => keyring.platformIssuerPublicKey(),
      deploymentIssuer: () => deployments.load()?.issuer ?? null,
      sharedStockVault: () => deployments.load()?.stockVault ?? null,
    },
    new JsonContributionLog(store),
  );
  const presenter = new ListingPresenter(listings);
  const compliance = new ComplianceService(listings, sdex, keyring);
  const sdexMarket = new SdexMarketService(
    locks,
    listings,
    accounts,
    custody,
    compliance,
    sdex,
    usdc,
    clients,
    config.stellar.usdcCode,
    logger.child({ component: 'sdex' }),
  );
  const chainStatus = new OnChainStatusService(
    listings,
    accounts,
    sdexMarket,
    soroban,
    deployments,
    explorer,
  );
  const settlement = new SettlementService(
    listings,
    accounts,
    licitacion,
    sdexMarket,
    chainStatus,
    explorer,
    logger.child({ component: 'settlement' }),
  );
  const offerings = new OfferingService(
    locks,
    listings,
    presenter,
    accounts,
    custody,
    licitacion,
    settlement,
    chainStatus,
    sdexMarket,
    compliance,
    explorer,
  );
  const wallets = new WalletService(
    accountRepo,
    accounts,
    custody,
    friendbot,
    usdc,
    horizon,
    sdex,
    logger.child({ component: 'wallet' }),
  );
  const audit = new AuditTrail(auditRepo, clock);
  const twoFactor = new TwoFactorService(accountRepo, accounts, totp, cipher);
  const emailVerification = new EmailVerificationService(
    accountRepo,
    accounts,
    linkTokens,
    mailer,
    config.mail.appUrl,
    logger.child({ component: 'email-verification' }),
  );
  const passwordReset = new PasswordResetService(
    accountRepo,
    hasher,
    linkTokens,
    mailer,
    config.mail.appUrl,
    clock,
    logger.child({ component: 'password-reset' }),
  );
  const auth = new AuthService(
    accountRepo,
    accounts,
    bootstrap,
    hasher,
    tokens,
    identity,
    walletSignatures,
    wallets,
    twoFactor,
    linkTokens,
    emailVerification,
    clock,
    { autoApproveNewAccounts: config.demo.hackathon },
    new MailSecurityNotices(mailer, config.mail.appUrl, logger.child({ component: 'security' })),
  );
  const support = new SupportService(
    new JsonSupportRepository(store),
    mailer,
    () => admins.adminEmails(),
    clock,
    logger.child({ component: 'support' }),
  );
  const privacy = new AccountPrivacyService(
    accountRepo,
    kycRepo,
    selfies,
    audit,
    support,
    store,
    overrides.custodialFunds ?? new HorizonCustodialFunds(clients),
    walletSignatures,
    hasher,
    mailer,
    clock,
    logger.child({ component: 'privacy' }),
  );
  const kyc = new KycService(
    accountRepo,
    accounts,
    kycRepo,
    selfies,
    compliance,
    licitacion,
    listings,
    admins,
    {
      autoApprove: config.demo.kycAutoApprove,
      requireSelfie: !config.kyc.didit,
      enforceBusinessHours: config.demo.kycEnforceHours,
      requireEmailVerification: config.auth.requireEmailVerification,
    },
    logger.child({ component: 'kyc' }),
    emailVerification,
  );
  const didit = config.kyc.didit;
  const verification = new IdentityVerificationService(
    overrides.identityProvider ??
      (didit
        ? new DiditClient({ apiKey: didit.apiKey, workflowId: didit.workflowId, baseUrl: didit.apiUrl })
        : undefined),
    didit ? new DiditWebhookAuthenticator(didit.webhookSecret) : undefined,
    kyc,
    accounts,
    kycRepo,
    clock,
    { callbackUrl: `${config.mail.appUrl}/onboarding/kyc/callback` },
    logger.child({ component: 'identity' }),
  );
  const demo = new DemoDossierService(listings, keyring, deployments, friendbot);
  const issuance = new IssuanceWorkflowService(listings, stockVault, licitacion, keyring, demo, explorer);
  const sandbox = new SandboxOrderBookService(bookRepo, accounts, listings, presenter);
  const dividends = new DividendService(dividendRepo, listings, accounts);
  const portfolio = new PortfolioService(
    accounts,
    listings,
    sandbox,
    sdexMarket,
    sdex,
    dividends,
    horizon,
    usdc,
    explorer,
  );
  const stocks = new StockCatalogService(stockRepo);
  const products = new IssuanceProductService(deployments);
  const network = new NetworkAdminService(networkSettings, deployments, keyring, sdex);
  const mocks = new MockGatewayService();

  /* ------------------------------------- http ------------------------------------- */
  const limits = new RateLimiters();
  const cookie = new SessionCookie(config.auth.cookie);
  const guard = new AuthMiddleware(auth, accounts, cookie, { adminRequire2fa: config.auth.adminRequire2fa });
  const auditRoutes = new AuditMiddleware(audit);
  const moduleDeps: ModuleDeps = {
    config,
    logger,
    store,
    clock,
    deployments,
    clients,
    keyring,
    explorer,
    horizon,
    soroban,
    usdc,
    licitacion,
    stockVault,
    accounts,
    listings,
    offerings,
    settlement,
    audit,
    guard,
    limits,
    auditRoutes,
  };
  const chainModule = createChainModule(moduleDeps);
  const featureModules = [createTxModule(moduleDeps, chainModule.chainReads), chainModule];
  const app = createApp({
    config,
    logger: logger.child({ component: 'http' }),
    auth: guard,
    limits,
    controllers: [
      new HealthController(deployments),
      new AuthController(
        auth,
        accounts,
        wallets,
        twoFactor,
        emailVerification,
        passwordReset,
        cookie,
        guard,
        limits,
        auditRoutes,
      ),
      new WalletController(wallets, guard, limits),
      new KycController(kyc, verification, guard, limits, auditRoutes),
      new AccountController(
        privacy,
        auth,
        cookie,
        guard,
        limits,
        auditRoutes,
        /^\d{4}-\d{2}-\d{2}$/.test(config.legal.version) ? config.legal.version : '',
      ),
      new SupportController(support, guard, limits, auditRoutes),
      new CatalogController(stocks, products, mocks, guard, auditRoutes),
      new ListingController(
        listings,
        presenter,
        issuance,
        offerings,
        settlement,
        dividends,
        demo,
        guard,
        limits,
        auditRoutes,
      ),
      new MarketController(sandbox, sdexMarket, portfolio, wallets, chainStatus, guard),
      new AdminOpsController(network, compliance, guard, limits, auditRoutes, audit),
      ...featureModules.flatMap((m) => m.controllers),
    ],
  });

  const sweep = new SettlementSweepJob(
    settlement,
    config.jobs.settlementSweepMs,
    logger.child({ component: 'sweep' }),
  );

  return {
    app,
    bootstrap,
    sweep,
    services: { auth, accounts, wallets, kyc, listings, offerings, settlement, twoFactor, audit },
    async close() {
      sweep.stop();
      const closable = store as { close?: () => Promise<void>; flush?: () => Promise<void> };
      if (closable.close) await closable.close();
      else if (closable.flush) await closable.flush();
      await lockPool?.end().catch(() => undefined);
    },
  };
}
