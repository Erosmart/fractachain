import { Keypair, Networks } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';
import { fromUnits, toUnits } from '../../src/domain/stellar/Amounts';
import type {
  IDeploymentRegistry,
  TestnetDeployment,
} from '../../src/infrastructure/stellar/DeploymentRegistry';
import type { PlatformKeyring } from '../../src/infrastructure/stellar/PlatformKeyring';
import { SorobanGateway } from '../../src/infrastructure/stellar/SorobanGateway';
import type { StellarClients } from '../../src/infrastructure/stellar/StellarClients';
import { CIRCLE_TESTNET_USDC, UsdcSupplySelector } from '../../src/infrastructure/stellar/UsdcSupply';
import { NotConfiguredError } from '../../src/shared/errors';

describe('token decimals', () => {
  it('converts with the token’s own decimals instead of assuming 7', () => {
    expect(toUnits(20, 7)).toBe(200_000_000n);
    expect(toUnits(10.5, 7)).toBe(105_000_000n);
    expect(toUnits(20, 6)).toBe(20_000_000n);
    expect(fromUnits(200_000_000n, 7)).toBe(20);
    expect(fromUnits('123456789', 6)).toBeCloseTo(123.456789, 9);
    expect(() => toUnits(1.12345678, 7)).toThrow(/7 decimales/);
    expect(() => toUnits(0, 7)).toThrow(/Monto inválido/);
  });

  it('reads decimals() from the token contract and falls back to 7 only when it can’t', async () => {
    const gateway = new SorobanGateway(
      {} as StellarClients,
      { load: () => null } as unknown as IDeploymentRegistry,
    );
    const sim = gateway as unknown as { simulateCall: (id: string, m: string) => Promise<unknown> };
    sim.simulateCall = async (_id, method) => (method === 'decimals' ? 6 : 'USDC:GISSUER');
    expect(await gateway.tokenInfo('CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA')).toEqual({
      contractId: 'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA',
      code: 'USDC',
      issuer: 'GISSUER',
      decimals: 6,
    });

    const broken = new SorobanGateway(
      {} as StellarClients,
      { load: () => null } as unknown as IDeploymentRegistry,
    );
    (broken as unknown as typeof sim).simulateCall = async () => {
      throw new Error('rpc down');
    };
    let warned = false;
    expect(
      await broken.tokenDecimals(
        'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC',
        () => (warned = true),
      ),
    ).toBe(7);
    expect(warned).toBe(true);
  });
});

describe('USDC supply', () => {
  const pool = Keypair.random();
  const issuer = Keypair.random();
  function setup(opts: {
    deployment?: Partial<TestnetDeployment>;
    issuerSecret?: boolean;
    poolSecret?: boolean;
  }) {
    const keyring = {
      hasUsdcIssuerSecret: () => Boolean(opts.issuerSecret),
      usdcIssuerPublicKey: () => (opts.issuerSecret ? issuer.publicKey() : null),
      usdcIssuer: async () => issuer,
      usdcPoolPublicKey: () => (opts.poolSecret ? pool.publicKey() : null),
      usdcPool: () => pool,
    } as unknown as PlatformKeyring;
    const deployments = {
      load: () =>
        opts.deployment ? ({ network: 'testnet', ...opts.deployment } as TestnetDeployment) : null,
    } as unknown as IDeploymentRegistry;
    return (explicitMode?: 'circle' | 'team', isTestnet = true) =>
      new UsdcSupplySelector(keyring, deployments, {
        explicitMode,
        isTestnet,
        assetCode: 'USDC',
        teamGrant: 10_000,
        poolGrant: 100,
      });
  }

  it('picks circle or team from USDC_MODE, the deployment file, then the keys at hand', () => {
    expect(setup({ issuerSecret: true })('circle').mode()).toBe('circle');
    expect(
      setup({
        deployment: { usdc: { mode: 'circle', code: 'USDC', issuer: 'G', sac: 'C', decimals: 7 } },
        issuerSecret: true,
      })().mode(),
    ).toBe('circle');
    expect(setup({ issuerSecret: true })().mode()).toBe('team');
    expect(setup({})().mode()).toBe('circle');
    expect(setup({})(undefined, false).mode()).toBe('team');
  });

  it('circle mode settles in Circle’s testnet SAC and pays grants from the demo pool', async () => {
    const supply = setup({ poolSecret: true })('circle').current();
    expect(supply.issuer()).toBe(CIRCLE_TESTNET_USDC.issuer);
    expect(supply.sac(Networks.TESTNET)).toBe(CIRCLE_TESTNET_USDC.sac);
    expect((await supply.payer()).publicKey()).toBe(pool.publicKey());
    expect(await supply.authorizer()).toBeNull();
    expect(supply.grantCap()).toBe(100);
    await expect(setup({})('circle').current().payer()).rejects.toThrow(NotConfiguredError);
  });

  it('team mode mints from the platform issuer, which can authorize trustlines', async () => {
    const supply = setup({ issuerSecret: true })('team').current();
    expect(supply.issuer()).toBe(issuer.publicKey());
    expect((await supply.payer()).publicKey()).toBe(issuer.publicKey());
    expect((await supply.authorizer())?.publicKey()).toBe(issuer.publicKey());
    expect(supply.grantCap()).toBe(10_000);
  });
});
