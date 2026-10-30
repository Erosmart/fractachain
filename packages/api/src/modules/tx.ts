import { TxBuildStore } from '../application/tx/TxBuildStore';
import { TxService } from '../application/tx/TxService';
import { TxController } from '../http/controllers/TxController';
import type { ChainReadsHook, FeatureModule, ModuleDeps } from './types';

/**
 * Deliverable 2 (Instaward 1): non-custodial signing — POST /api/tx/build,
 * POST /api/tx/submit, GET /api/tx/:hash. See docs/instaward-1/plan.md.
 */
export function createTxModule(deps: ModuleDeps, chainReads?: ChainReadsHook): FeatureModule {
  const service = new TxService({
    accounts: deps.accounts,
    listings: deps.listings,
    offerings: deps.offerings,
    paymentAsset: (listing) => deps.licitacion.paymentAsset(listing),
    usdc: deps.usdc,
    chain: deps.soroban,
    explorer: deps.explorer,
    builds: new TxBuildStore(deps.store, () => deps.clock.now()),
    clock: deps.clock,
    network: () => ({ name: deps.config.stellar.network, passphrase: deps.clients.networkPassphrase() }),
    logger: deps.logger.child({ component: 'tx' }),
    onConfirmed: (contractId, source) => chainReads?.forget(contractId, source),
  });
  return { controllers: [new TxController(service, deps.guard, deps.auditRoutes, deps.explorer)] };
}
