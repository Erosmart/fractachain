import { describe, expect, it } from 'vitest';
import { planDeploy } from '../../src/infrastructure/stellar/ContractDeployPlan';
import { NotConfiguredError } from '../../src/shared/errors';

const fns = (...names: string[]) => new Set(names);

const NEW_FACTORY = fns(
  '__constructor',
  'deploy_stock_vault',
  'deploy_forward',
  'deploy_warrant',
  'set_payment_asset',
);
const OLD_FACTORY = fns('initialize', 'register_product', 'set_payment_asset');

describe('planDeploy (SC-06 constructors, SC-02 factory-bound vaults)', () => {
  it('deploys constructor WASMs that need no registry in one transaction', () => {
    expect(planDeploy('licitacion', fns('__constructor', 'contribute'))).toEqual({ kind: 'constructor' });
    expect(planDeploy('factory', fns('__constructor', 'deploy_stock_vault'))).toEqual({
      kind: 'constructor',
    });
  });

  it('routes registry-bound constructor WASMs through the factory', () => {
    expect(planDeploy('stockVault', fns('__constructor'), NEW_FACTORY)).toEqual({
      kind: 'factory',
      method: 'deploy_stock_vault',
    });
    expect(planDeploy('forward', fns('__constructor'), NEW_FACTORY)).toEqual({
      kind: 'factory',
      method: 'deploy_forward',
    });
    expect(planDeploy('warrant', fns('__constructor'), NEW_FACTORY)).toEqual({
      kind: 'factory',
      method: 'deploy_warrant',
    });
  });

  it('refuses a new vault WASM with an old factory (it could never be constructed)', () => {
    expect(() => planDeploy('stockVault', fns('__constructor'), OLD_FACTORY)).toThrow(NotConfiguredError);
    expect(() => planDeploy('warrant', fns('__constructor'))).toThrow(/clone-factory/);
  });

  it('keeps legacy WASMs on deploy + initialize', () => {
    expect(planDeploy('licitacion', fns('initialize', 'contribute'))).toEqual({
      kind: 'legacy',
      initMethod: 'initialize',
    });
    expect(planDeploy('stockVault', fns('initialize_stock'), NEW_FACTORY)).toEqual({
      kind: 'legacy',
      initMethod: 'initialize_stock',
    });
    expect(planDeploy('forward', fns('initialize'), OLD_FACTORY)).toEqual({
      kind: 'legacy',
      initMethod: 'initialize',
    });
  });

  it('rejects a WASM with neither entry point', () => {
    expect(() => planDeploy('licitacion', fns('contribute'))).toThrow(/__constructor ni initialize/);
  });
});
