import type { AccountService } from '../application/account/AccountService';
import type { AuditTrail } from '../application/audit/AuditTrail';
import type { ListingLedger } from '../application/listing/ListingLedger';
import type { OfferingService } from '../application/offering/OfferingService';
import type { SettlementService } from '../application/settlement/SettlementService';
import type { AppConfig } from '../config/env';
import type { AuditMiddleware } from '../http/middleware/AuditMiddleware';
import type { AuthMiddleware } from '../http/middleware/AuthMiddleware';
import type { RateLimiters } from '../http/middleware/rateLimiters';
import type { Controller } from '../http/controllers/Controller';
import type { IDocumentStore } from '../infrastructure/persistence/DocumentStore';
import type { IDeploymentRegistry } from '../infrastructure/stellar/DeploymentRegistry';
import type { Explorer } from '../infrastructure/stellar/Explorer';
import type { HorizonAccounts } from '../infrastructure/stellar/HorizonAccounts';
import type { LicitacionContract } from '../infrastructure/stellar/LicitacionContract';
import type { PlatformKeyring } from '../infrastructure/stellar/PlatformKeyring';
import type { SorobanGateway } from '../infrastructure/stellar/SorobanGateway';
import type { StellarClients } from '../infrastructure/stellar/StellarClients';
import type { StockVaultContract } from '../infrastructure/stellar/StockVaultContract';
import type { UsdcFaucet } from '../infrastructure/stellar/UsdcFaucet';
import type { IClock } from '../shared/clock';
import type { ILogger } from '../shared/logger';

/**
 * What a feature module may use from the composition root. Modules (Instaward 1:
 * `tx`, `chain`) build their own services and controllers from these, so adding
 * one never means editing the shared wiring.
 */
export interface ModuleDeps {
  config: AppConfig;
  logger: ILogger;
  store: IDocumentStore;
  clock: IClock;
  deployments: IDeploymentRegistry;
  clients: StellarClients;
  keyring: PlatformKeyring;
  explorer: Explorer;
  horizon: HorizonAccounts;
  soroban: SorobanGateway;
  usdc: UsdcFaucet;
  licitacion: LicitacionContract;
  stockVault: StockVaultContract;
  accounts: AccountService;
  listings: ListingLedger;
  offerings: OfferingService;
  settlement: SettlementService;
  audit: AuditTrail;
  guard: AuthMiddleware;
  limits: RateLimiters;
  auditRoutes: AuditMiddleware;
}

export interface FeatureModule {
  controllers: Controller[];
}

/** What the chain module offers other modules (cache invalidation after writes). */
export interface ChainReadsHook {
  forget(contractId?: string, address?: string): void;
}
