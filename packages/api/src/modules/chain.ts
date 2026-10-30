import { ChainReadService } from '../application/chain/ChainReadService';
import { ChainController } from '../http/controllers/ChainController';
import { HorizonAccountReader } from '../infrastructure/stellar/AccountReader';
import { RpcContractReader } from '../infrastructure/stellar/ContractReader';
import type { FeatureModule, ModuleDeps } from './types';

/**
 * Deliverable 3 (Instaward 1): read-only chain views — GET /api/chain/*.
 * See docs/instaward-1/plan.md.
 */
export function createChainModule(deps: ModuleDeps): FeatureModule {
  const { clients, deployments, listings, config, clock, logger } = deps;
  const service = new ChainReadService(
    new RpcContractReader(clients),
    new HorizonAccountReader(clients),
    {
      deployment: () => deployments.load(),
      // The ledger only names the contracts and labels them; values are read from the chain.
      listedTenders: () =>
        listings
          .list()
          .filter((l) => listings.isOnChain(l) && l.licitacionContract)
          .map((l) => ({
            contractId: l.licitacionContract,
            listingId: l.id,
            title: l.dossier.tradeName || l.dossier.legalName || l.dossier.tokenTicker,
          })),
    },
    {
      network: config.stellar.network,
      networkPassphrase: () => clients.networkPassphrase(),
      rpcUrl: () => clients.rpcUrlValue(),
      horizonUrl: () => String(clients.horizon().serverURL),
      explorerUrl: config.stellar.explorerUrl,
    },
    clock,
    logger.child({ component: 'chain' }),
  );
  return { controllers: [new ChainController(service)] };
}
