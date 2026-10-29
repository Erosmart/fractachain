/**
 * Shared wiring for the operator CLIs (`npm run deploy:*`): the same config,
 * keyring and Soroban gateway the API uses, without the HTTP layer.
 */
import { loadConfig, type AppConfig } from '../config/env';
import { loadEnvironment } from '../platform/environment';
import { JsonFileDocumentStore } from '../infrastructure/persistence/JsonFileDocumentStore';
import { JsonListingRepository } from '../infrastructure/persistence/repositories/JsonListingRepository';
import { JsonNetworkSettingsRepository } from '../infrastructure/persistence/repositories/JsonNetworkSettingsRepository';
import { FileDeploymentRegistry } from '../infrastructure/stellar/DeploymentRegistry';
import { FriendbotClient } from '../infrastructure/stellar/FriendbotClient';
import { PlatformKeyring } from '../infrastructure/stellar/PlatformKeyring';
import { EnvFileSecretStore } from '../infrastructure/stellar/SecretStore';
import { SorobanGateway } from '../infrastructure/stellar/SorobanGateway';
import { StellarClients } from '../infrastructure/stellar/StellarClients';
import { PinoLogger, type ILogger } from '../shared/logger';

export interface CliToolkit {
  config: AppConfig;
  logger: ILogger;
  deployments: FileDeploymentRegistry;
  keyring: PlatformKeyring;
  soroban: SorobanGateway;
  friendbot: FriendbotClient;
  listings: JsonListingRepository;
}

export function cliToolkit(): CliToolkit {
  loadEnvironment();
  const config = loadConfig();
  const logger = PinoLogger.create({ level: 'info', service: 'fractachain-cli' });
  const store = new JsonFileDocumentStore(config.storage.dataDir, logger);
  const settings = new JsonNetworkSettingsRepository(store, {
    mode: 'deploy',
    friendbot: true,
    horizonUrl: config.stellar.horizonUrl,
    rpcUrl: config.stellar.rpcUrl,
    networkPassphrase: config.stellar.networkPassphrase,
    notes: '',
    settlePolicy: 'ON_MIN',
    updatedAt: new Date().toISOString(),
  });
  const deployments = new FileDeploymentRegistry(config.stellar.deploymentFile);
  const clients = new StellarClients(settings);
  const friendbot = new FriendbotClient(config.stellar.friendbotUrl, clients);
  const keyring = new PlatformKeyring(new EnvFileSecretStore(config.storage.envFile, logger), deployments, friendbot, config.stellar.isTestnet, logger);
  return {
    config,
    logger,
    deployments,
    keyring,
    soroban: new SorobanGateway(clients, deployments),
    friendbot,
    listings: new JsonListingRepository(store),
  };
}

export function runCli(main: () => Promise<void>): void {
  main().catch((err: unknown) => {
    // eslint-disable-next-line no-console
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
