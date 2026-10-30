import { NotConfiguredError } from '../../shared/errors';

/** Contracts the platform instantiates. */
export type DeployableContract = 'factory' | 'licitacion' | 'stockVault' | 'forward' | 'warrant';

/** Factory entry points that deploy registry-bound products (SC-02). */
export type FactoryDeployMethod = 'deploy_stock_vault' | 'deploy_forward' | 'deploy_warrant';

/**
 * How to instantiate a contract, decided from the functions its WASM exposes:
 *
 * - `constructor`: one transaction, arguments go to `__constructor` (SC-06).
 * - `factory`: the issuance factory deploys it and signs off the constructor,
 *   which is the only way to bind a vault to the factory as its registry (SC-02).
 * - `legacy`: WASMs uploaded before the migration: deploy, then `initialize`
 *   in a second transaction, then read the state back (front-running check).
 */
export type DeployPlan =
  | { kind: 'constructor' }
  | { kind: 'factory'; method: FactoryDeployMethod }
  | { kind: 'legacy'; initMethod: 'initialize' | 'initialize_stock' };

const FACTORY_METHOD: Partial<Record<DeployableContract, FactoryDeployMethod>> = {
  stockVault: 'deploy_stock_vault',
  forward: 'deploy_forward',
  warrant: 'deploy_warrant',
};

const LEGACY_INIT: Record<DeployableContract, 'initialize' | 'initialize_stock'> = {
  factory: 'initialize',
  licitacion: 'initialize',
  stockVault: 'initialize_stock',
  forward: 'initialize',
  warrant: 'initialize',
};

const LABEL: Record<DeployableContract, string> = {
  factory: 'la factory',
  licitacion: 'la licitación',
  stockVault: 'el stock vault',
  forward: 'el forward',
  warrant: 'el warrant',
};

export const CONSTRUCTOR = '__constructor';

/**
 * @param contractFunctions functions of the WASM to instantiate
 * @param factoryFunctions functions of the configured factory's WASM (only
 *   needed for registry-bound products)
 */
export function planDeploy(
  contract: DeployableContract,
  contractFunctions: ReadonlySet<string>,
  factoryFunctions?: ReadonlySet<string>,
): DeployPlan {
  if (contractFunctions.has(CONSTRUCTOR)) {
    const method = FACTORY_METHOD[contract];
    if (!method) return { kind: 'constructor' };
    if (factoryFunctions?.has(method)) return { kind: 'factory', method };
    throw new NotConfiguredError(
      `El WASM de ${LABEL[contract]} sólo se puede desplegar desde la factory, y la factory configurada ` +
        `no tiene ${method} (WASM viejo). Subí el WASM nuevo de la factory y cloná una: ` +
        'testnet:upload-wasm factory=… y testnet:clone-factory.',
    );
  }
  const initMethod = LEGACY_INIT[contract];
  if (!contractFunctions.has(initMethod)) {
    throw new NotConfiguredError(`El WASM de ${LABEL[contract]} no tiene ${CONSTRUCTOR} ni ${initMethod}`);
  }
  return { kind: 'legacy', initMethod };
}
