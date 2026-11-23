import { Keypair, StrKey } from '@stellar/stellar-sdk';
import { NotConfiguredError, UpstreamError } from '../../shared/errors';
import type { ILogger } from '../../shared/logger';
import type { IDeploymentRegistry } from './DeploymentRegistry';
import type { IFriendbot } from './FriendbotClient';
import type { ISecretStore } from './SecretStore';

export const SECRET = {
  deployer: 'STELLAR_DEPLOYER_SECRET',
  issuer: 'STELLAR_ISSUER_SECRET',
  platformIssuer: 'STELLAR_PLATFORM_ISSUER_SECRET',
  usdcIssuer: 'STELLAR_USDC_ISSUER_SECRET',
  usdcIssuerPublic: 'STELLAR_USDC_ISSUER',
  licitacionAdmin: 'STELLAR_LICITACION_ADMIN_SECRET',
  porOracle: 'STELLAR_POR_ORACLE_SECRET',
  /** Demo pool holding Circle's testnet USDC (reviewers are funded from it). */
  usdcPool: 'STELLAR_USDC_POOL_SECRET',
} as const;

/**
 * Every platform signing key, resolved in one place.
 *
 * On testnet, missing operational keys are provisioned on demand (Friendbot
 * funds them) and persisted through the secret store, so a fresh clone still
 * runs the full loop. On any other network the keys must be configured:
 * nothing is generated silently.
 */
export class PlatformKeyring {
  constructor(
    private readonly secrets: ISecretStore,
    private readonly deployments: IDeploymentRegistry,
    private readonly friendbot: IFriendbot,
    private readonly allowProvisioning: boolean,
    private readonly logger: ILogger,
  ) {}

  private keypairFrom(name: string): Keypair | null {
    const secret = this.secrets.get(name);
    if (!secret?.startsWith('S')) return null;
    try {
      return Keypair.fromSecret(secret);
    } catch {
      return null;
    }
  }

  private requireKeypair(name: string, expected?: string): Keypair {
    const kp = this.keypairFrom(name);
    if (!kp) {
      throw new NotConfiguredError(
        `Falta ${name} en apps/api/.env (la S… de esa cuenta). No la subas a git.`,
      );
    }
    if (expected && kp.publicKey() !== expected) {
      throw new NotConfiguredError(`${name} no corresponde a ${expected} (dio ${kp.publicKey()}).`);
    }
    return kp;
  }

  deployer(): Keypair {
    return this.requireKeypair(SECRET.deployer, this.deployments.load()?.deployer);
  }

  hasDeployer(): boolean {
    try {
      this.deployer();
      return true;
    } catch {
      return false;
    }
  }

  /** Issuer account of the security tokens that the backend can sign for, if any. */
  platformIssuerPublicKey(): string | null {
    return (this.keypairFrom(SECRET.issuer) ?? this.keypairFrom(SECRET.platformIssuer))?.publicKey() ?? null;
  }

  /** Keypair that signs as the issuer of an asset, or throws naming the fix. */
  issuerFor(assetIssuer: string): Keypair {
    for (const name of [SECRET.issuer, SECRET.platformIssuer, SECRET.usdcIssuer, SECRET.deployer]) {
      const kp = this.keypairFrom(name);
      if (kp?.publicKey() === assetIssuer) return kp;
    }
    throw new NotConfiguredError(
      `La plataforma no tiene la clave del emisor ${assetIssuer}. ` +
        'Configurá STELLAR_ISSUER_SECRET con la S… de esa cuenta, o emití el listing con el emisor provisionado.',
    );
  }

  /** The security-token issuer, provisioning one on testnet when none is configured. */
  async ensurePlatformIssuer(): Promise<Keypair> {
    return (
      this.keypairFrom(SECRET.issuer) ??
      this.keypairFrom(SECRET.platformIssuer) ??
      this.provision(SECRET.platformIssuer, 'emisor de plataforma')
    );
  }

  /** Public key of the testnet USDC issuer (secret → env pubkey → deployments). */
  usdcIssuerPublicKey(): string | null {
    const fromSecret = this.keypairFrom(SECRET.usdcIssuer);
    if (fromSecret) return fromSecret.publicKey();
    const configured = this.secrets.get(SECRET.usdcIssuerPublic);
    if (configured && StrKey.isValidEd25519PublicKey(configured)) return configured;
    return this.deployments.load()?.usdcClassic?.issuer ?? null;
  }

  async usdcIssuer(): Promise<Keypair> {
    const want = this.usdcIssuerPublicKey();
    for (const name of [
      SECRET.usdcIssuer,
      SECRET.issuer,
      SECRET.platformIssuer,
      SECRET.deployer,
      SECRET.licitacionAdmin,
    ]) {
      const kp = this.keypairFrom(name);
      if (want && kp?.publicKey() === want) return kp;
    }
    if (want) {
      throw new NotConfiguredError(
        `La plataforma no tiene la clave del emisor USDC ${want}. Configurá STELLAR_USDC_ISSUER_SECRET con la S… de esa cuenta.`,
      );
    }
    const kp = await this.provision(SECRET.usdcIssuer, 'emisor USDC de testnet');
    this.secrets.set(SECRET.usdcIssuerPublic, kp.publicKey());
    return kp;
  }

  /** The configured USDC issuer's key, if this machine has it (team-issued test USDC). */
  hasUsdcIssuerSecret(): boolean {
    return this.keypairFrom(SECRET.usdcIssuer) !== null;
  }

  /** Demo USDC pool (Circle mode): public key from the secret, else from the deployment file. */
  usdcPoolPublicKey(): string | null {
    return this.keypairFrom(SECRET.usdcPool)?.publicKey() ?? this.deployments.load()?.usdcPool ?? null;
  }

  /** Signer of the demo USDC pool. Never provisioned: it only holds what was put in it. */
  usdcPool(): Keypair {
    return this.requireKeypair(SECRET.usdcPool, this.deployments.load()?.usdcPool);
  }

  /** PoR oracle for per-listing vaults; must differ from the vault admin. */
  async porOracle(): Promise<Keypair> {
    return this.keypairFrom(SECRET.porOracle) ?? this.provision(SECRET.porOracle, 'oráculo PoR');
  }

  /** Admin of licitación / vault instances: the deployer, else a provisioned admin. */
  async licitacionAdmin(): Promise<Keypair> {
    if (this.hasDeployer()) return this.deployer();
    return (
      this.keypairFrom(SECRET.licitacionAdmin) ??
      this.provision(SECRET.licitacionAdmin, 'admin de licitación')
    );
  }

  /** Signals that on-chain KYC enforcement (trustline authorization) is possible. */
  hasIssuerKey(): boolean {
    return Boolean(this.keypairFrom(SECRET.issuer) ?? this.keypairFrom(SECRET.platformIssuer));
  }

  private async provision(name: string, label: string): Promise<Keypair> {
    if (!this.allowProvisioning) {
      throw new NotConfiguredError(
        `Falta ${name}: fuera de testnet las claves de plataforma no se generan solas.`,
      );
    }
    const kp = Keypair.random();
    for (let attempt = 0; attempt < 3; attempt++) {
      const faucet = await this.friendbot.fund(kp.publicKey());
      if (faucet.funded) {
        this.secrets.set(name, kp.secret());
        this.logger.warn(`${label} provisionado en testnet`, { publicKey: kp.publicKey(), env: name });
        return kp;
      }
      await new Promise((r) => setTimeout(r, 1500));
    }
    throw new UpstreamError(`Friendbot no fondeó el ${label} ${kp.publicKey()}`);
  }
}
