/**
 * Where the platform's test USDC comes from (Instaward 1, Deliverable 1).
 *
 * - `circle`: Circle's USDC on testnet. The platform cannot mint it: grants are
 *   payments from a demo pool account filled beforehand (Circle's faucet or the
 *   testnet DEX — `npm run stellar:fund-pool`).
 * - `team`: a test asset the platform issues itself (local networks, or the
 *   fallback the SOW allows if Circle's testnet USDC is unavailable). Grants
 *   are minted by the issuer, which can also authorize trustlines.
 *
 * Tenders don't care: they are token-agnostic and settle in whichever SAC the
 * deployment registered.
 */
import { Asset, type Keypair } from '@stellar/stellar-sdk';
import { isContractId, isStellarPublicKey } from '../../domain/stellar/StellarAddress';
import { NotConfiguredError } from '../../shared/errors';
import type { IDeploymentRegistry } from './DeploymentRegistry';
import type { PlatformKeyring } from './PlatformKeyring';

export type UsdcMode = 'circle' | 'team';

/** Circle's USDC on Stellar testnet (https://developers.circle.com/stablecoins/usdc-contract-addresses). */
export const CIRCLE_TESTNET_USDC = {
  code: 'USDC',
  issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
  sac: 'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA',
} as const;

export interface IUsdcSupply {
  readonly mode: UsdcMode;
  /** Classic asset code and issuer, or null when not configured. */
  issuer(): string | null;
  code(): string;
  /** Stellar Asset Contract the tenders settle in. */
  sac(networkPassphrase: string): string | null;
  /** Account whose balance pays the grants (pool or issuer). */
  payer(): Promise<Keypair>;
  /** Issuer signer when the platform controls the issuer (authorizes trustlines). */
  authorizer(): Promise<Keypair | null>;
  /** Largest single grant. */
  grantCap(): number;
}

export class TeamIssuerSupply implements IUsdcSupply {
  readonly mode = 'team' as const;

  constructor(
    private readonly keyring: PlatformKeyring,
    private readonly deployments: IDeploymentRegistry,
    private readonly assetCode: string,
    private readonly maxGrant: number,
  ) {}

  issuer(): string | null {
    const fromDeployment = this.deployments.load()?.usdc;
    if (fromDeployment?.mode === 'team' && isStellarPublicKey(fromDeployment.issuer))
      return fromDeployment.issuer;
    return this.keyring.usdcIssuerPublicKey();
  }

  code(): string {
    const fromDeployment = this.deployments.load()?.usdc;
    return fromDeployment?.mode === 'team' && fromDeployment.code ? fromDeployment.code : this.assetCode;
  }

  sac(networkPassphrase: string): string | null {
    const d = this.deployments.load();
    if (d?.usdc?.mode === 'team' && isContractId(d.usdc.sac)) return d.usdc.sac;
    if (isContractId(d?.usdcSac)) return d!.usdcSac!;
    const issuer = this.issuer();
    return issuer ? new Asset(this.code(), issuer).contractId(networkPassphrase) : null;
  }

  payer(): Promise<Keypair> {
    return this.keyring.usdcIssuer();
  }

  async authorizer(): Promise<Keypair | null> {
    return this.keyring.usdcIssuer();
  }

  grantCap(): number {
    return this.maxGrant;
  }
}

export class CirclePoolSupply implements IUsdcSupply {
  readonly mode = 'circle' as const;

  constructor(
    private readonly keyring: PlatformKeyring,
    private readonly deployments: IDeploymentRegistry,
    private readonly maxGrant: number,
  ) {}

  issuer(): string {
    const d = this.deployments.load()?.usdc;
    return d?.mode === 'circle' && isStellarPublicKey(d.issuer) ? d.issuer : CIRCLE_TESTNET_USDC.issuer;
  }

  code(): string {
    return CIRCLE_TESTNET_USDC.code;
  }

  sac(networkPassphrase: string): string {
    const d = this.deployments.load()?.usdc;
    if (d?.mode === 'circle' && isContractId(d.sac)) return d.sac;
    return new Asset(this.code(), this.issuer()).contractId(networkPassphrase);
  }

  async payer(): Promise<Keypair> {
    if (!this.keyring.usdcPoolPublicKey()) {
      throw new NotConfiguredError(
        'No hay pool de USDC de demo: configurá STELLAR_USDC_POOL_SECRET (npm run stellar:fund-pool lo crea y lo carga).',
      );
    }
    return this.keyring.usdcPool();
  }

  async authorizer(): Promise<null> {
    return null;
  }

  grantCap(): number {
    return this.maxGrant;
  }
}

export interface UsdcSupplyOptions {
  /** `USDC_MODE` from the environment; wins over everything else. */
  explicitMode?: UsdcMode;
  isTestnet: boolean;
  assetCode: string;
  teamGrant: number;
  poolGrant: number;
}

/**
 * Picks the supply at call time (the deployment file can change under a
 * running server): `USDC_MODE` → the deployment's `usdc.mode` → `team` when
 * this machine holds the USDC issuer key → `circle` on testnet → `team`.
 */
export class UsdcSupplySelector {
  private readonly team: TeamIssuerSupply;
  private readonly circle: CirclePoolSupply;

  constructor(
    private readonly keyring: PlatformKeyring,
    private readonly deployments: IDeploymentRegistry,
    private readonly options: UsdcSupplyOptions,
  ) {
    this.team = new TeamIssuerSupply(keyring, deployments, options.assetCode, options.teamGrant);
    this.circle = new CirclePoolSupply(keyring, deployments, options.poolGrant);
  }

  mode(): UsdcMode {
    if (this.options.explicitMode) return this.options.explicitMode;
    const fromDeployment = this.deployments.load()?.usdc?.mode;
    if (fromDeployment === 'circle' || fromDeployment === 'team') return fromDeployment;
    if (this.keyring.hasUsdcIssuerSecret()) return 'team';
    return this.options.isTestnet ? 'circle' : 'team';
  }

  current(): IUsdcSupply {
    return this.mode() === 'circle' ? this.circle : this.team;
  }
}
