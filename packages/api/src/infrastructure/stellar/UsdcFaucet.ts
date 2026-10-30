/**
 * Test USDC for investors and company wallets: trustlines and grants.
 *
 * The money comes from a `UsdcSupply` (see UsdcSupply.ts): Circle's testnet
 * USDC paid out of the demo pool, or a team-issued test asset minted by its
 * issuer. The issuer of the security tokens is a different account on purpose:
 * that one runs `AUTH_REQUIRED`, which would make every USDC trustline need
 * sign-off.
 */
import { Asset, Keypair, Operation, type xdr } from '@stellar/stellar-sdk';
import { isStellarPublicKey } from '../../domain/stellar/StellarAddress';
import { DomainError, NotConfiguredError } from '../../shared/errors';
import type { DeploymentRegistryLike } from './types';
import type { IDeploymentRegistry } from './DeploymentRegistry';
import type { Explorer } from './Explorer';
import type { IFriendbot } from './FriendbotClient';
import type { HorizonAccounts } from './HorizonAccounts';
import type { PlatformKeyring } from './PlatformKeyring';
import { toStellarAmount, type SdexGateway } from './SdexGateway';
import { UsdcSupplySelector, type IUsdcSupply, type UsdcMode } from './UsdcSupply';

/** Marker thrown when a wallet must sign its own trustline first. */
export const USDC_NEEDS_TRUSTLINE = 'USDC_NEEDS_TRUSTLINE';

export class UsdcNeedsTrustlineError extends Error {
  constructor() {
    super(USDC_NEEDS_TRUSTLINE);
  }
}

export interface UsdcFundResult {
  funded: boolean;
  already: boolean;
  balance: number;
  trustline: boolean;
  hash: string | null;
  explorer: string | null;
  issuer: string;
}

export interface UsdcFaucetOptions {
  /** `USDC_MODE` (circle | team); unset = decided by the deployment file. */
  mode?: UsdcMode;
  isTestnet?: boolean;
  networkPassphrase?: string;
  /** Largest grant out of Circle's demo pool (small: it only holds what was put in). */
  poolGrant?: number;
}

export class UsdcFaucet {
  private readonly supplies: UsdcSupplySelector;
  private readonly passphrase: string;

  constructor(
    code: string,
    private readonly defaultGrant: number,
    private readonly keyring: PlatformKeyring,
    private readonly sdex: SdexGateway,
    private readonly accounts: HorizonAccounts,
    private readonly friendbot: IFriendbot,
    deployments: DeploymentRegistryLike,
    private readonly explorer: Explorer,
    options: UsdcFaucetOptions = {},
  ) {
    this.passphrase = options.networkPassphrase ?? 'Test SDF Network ; September 2015';
    this.supplies = new UsdcSupplySelector(keyring, deployments as IDeploymentRegistry, {
      explicitMode: options.mode,
      isTestnet: options.isTestnet ?? this.passphrase.includes('Test SDF'),
      assetCode: code,
      teamGrant: defaultGrant,
      poolGrant: options.poolGrant ?? 100,
    });
  }

  /** Where grants come from right now (`circle` pool or `team` issuer). */
  supply(): IUsdcSupply {
    return this.supplies.current();
  }

  mode(): UsdcMode {
    return this.supplies.mode();
  }

  issuerPublicKey(): string | null {
    return this.supply().issuer();
  }

  asset(): Asset {
    const supply = this.supply();
    const issuer = supply.issuer();
    if (!isStellarPublicKey(issuer)) {
      throw new NotConfiguredError('Falta el emisor USDC de testnet (STELLAR_USDC_ISSUER_SECRET)');
    }
    return new Asset(supply.code(), issuer);
  }

  /** SAC the tenders settle in (Circle's USDC SAC in `circle` mode). */
  sac(): string | null {
    return this.supply().sac(this.passphrase);
  }

  async balance(publicKey: string): Promise<number> {
    const supply = this.supply();
    const issuer = supply.issuer();
    return issuer ? this.accounts.assetBalance(publicKey, supply.code(), issuer) : 0;
  }

  /**
   * Issues the grant, creating/authorizing the trustline when the wallet secret
   * is available (custodial wallets and demo treasuries). Without it a missing
   * trustline throws `UsdcNeedsTrustlineError` so the caller can hand the user
   * a `changeTrust` XDR instead.
   *
   * `onlyIfEmpty` is for automatic heals: they must never top a wallet back up,
   * which would silently undo every purchase.
   */
  async fund(
    wallet: string,
    opts?: { walletSecret?: string | null; grant?: number; onlyIfEmpty?: boolean },
  ): Promise<UsdcFundResult> {
    const supply = this.supply();
    const asset = this.asset();
    const grant = Math.min(opts?.grant ?? this.defaultGrant, supply.grantCap());

    await this.friendbot.fund(wallet).catch(() => undefined);
    const line = await this.sdex.trustlineState(wallet, asset);
    if (!line.exists && !opts?.walletSecret) throw new UsdcNeedsTrustlineError();

    const payer = await supply.payer();
    const ops: xdr.Operation[] = [];
    const signers: Keypair[] = [payer];
    if (!line.exists) {
      signers.push(Keypair.fromSecret(opts!.walletSecret!));
      ops.push(Operation.changeTrust({ asset, source: wallet }));
    }
    ops.push(...(await this.authorizeOps(wallet, asset, line.authorized, signers)));
    const gap = UsdcFaucet.grantGap(line.balance, grant, opts?.onlyIfEmpty);
    if (gap > 0) {
      await this.assertPoolCovers(payer, asset, gap);
      ops.push(
        Operation.payment({
          destination: wallet,
          asset,
          amount: toStellarAmount(gap),
          source: payer.publicKey(),
        }),
      );
    }
    if (!ops.length) return this.result(asset, line.balance, null, true);
    const submitted = await this.sdex.buildAndSubmit(
      payer.publicKey(),
      (b) => ops.reduce((acc, op) => acc.addOperation(op), b),
      signers,
    );
    return this.result(asset, await this.balance(wallet), submitted.hash, false);
  }

  /** Grant for a wallet that already opened its trustline (self-custody path, reviewer helper). */
  async payGrant(wallet: string, opts?: { onlyIfEmpty?: boolean; amount?: number }): Promise<UsdcFundResult> {
    const supply = this.supply();
    const asset = this.asset();
    const line = await this.sdex.trustlineState(wallet, asset);
    if (!line.exists) throw new UsdcNeedsTrustlineError();
    const payer = await supply.payer();
    const signers: Keypair[] = [payer];
    const ops = await this.authorizeOps(wallet, asset, line.authorized, signers);
    const grant = Math.min(opts?.amount ?? this.defaultGrant, supply.grantCap());
    // An explicit amount is a transfer (reviewer helper); otherwise top up to the grant.
    const gap = opts?.amount ? grant : UsdcFaucet.grantGap(line.balance, grant, opts?.onlyIfEmpty);
    if (gap > 0) {
      await this.assertPoolCovers(payer, asset, gap);
      ops.push(
        Operation.payment({
          destination: wallet,
          asset,
          amount: toStellarAmount(gap),
          source: payer.publicKey(),
        }),
      );
    }
    if (!ops.length) return this.result(asset, line.balance, null, true);
    const submitted = await this.sdex.buildAndSubmit(
      payer.publicKey(),
      (b) => ops.reduce((acc, op) => acc.addOperation(op), b),
      signers,
    );
    return this.result(asset, await this.balance(wallet), submitted.hash, false);
  }

  /**
   * Ensures the company (fiduciary) wallet can receive USDC. `false` means the
   * company must open the trustline itself before `finalize()` can pay out.
   */
  async ensureFiduciaryTrustline(wallet: string, walletSecret?: string | null): Promise<boolean> {
    const asset = this.asset();
    const line = await this.sdex.trustlineState(wallet, asset);
    if (line.exists && line.authorized) return true;
    if (!line.exists && !walletSecret) return false;
    const signers: Keypair[] = [];
    const ops: xdr.Operation[] = [];
    if (!line.exists) {
      signers.push(Keypair.fromSecret(walletSecret!));
      ops.push(Operation.changeTrust({ asset, source: wallet }));
    }
    ops.push(...(await this.authorizeOps(wallet, asset, line.authorized, signers)));
    if (!ops.length) return line.exists;
    await this.sdex.buildAndSubmit(
      signers[0].publicKey(),
      (b) => ops.reduce((acc, op) => acc.addOperation(op), b),
      signers,
    );
    const after = await this.sdex.trustlineState(wallet, asset);
    return after.exists && after.authorized;
  }

  /**
   * One-stop funding check used on login / dashboard:
   * 1. Friendbot creates the account when missing.
   * 2. XLM top-up for live-but-broke wallets.
   * 3. USDC trustline + grant — server-signed only for custodial wallets;
   *    self-custody without a trustline is skipped (the holder must sign it).
   *    Circle's USDC is never granted automatically: the demo pool is finite,
   *    so it only pays out on an explicit request.
   */
  async ensureWalletFunded(wallet: string, opts?: { walletSecret?: string | null }): Promise<unknown> {
    await this.friendbot.fund(wallet).catch(() => undefined);
    await this.accounts.topUpXlm(wallet).catch(() => undefined);
    if (this.mode() === 'circle') return { funded: false, reason: 'explicit-only' };
    if (opts?.walletSecret) return this.fund(wallet, { walletSecret: opts.walletSecret, onlyIfEmpty: true });
    const line = await this.sdex.trustlineState(wallet, this.asset());
    if (line.exists) return this.payGrant(wallet, { onlyIfEmpty: true });
    return { funded: false, trustline: false };
  }

  /** Snapshot for the wallet page: XLM + platform USDC. */
  async walletFunds(publicKey: string) {
    const supply = this.supply();
    const issuer = supply.issuer();
    const [xlm, usdc] = await Promise.all([
      this.accounts.nativeXlm(publicKey),
      issuer ? this.accounts.assetBalance(publicKey, supply.code(), issuer) : Promise.resolve(0),
    ]);
    return {
      xlm,
      usdc,
      usdcIssuer: issuer,
      usdcCode: supply.code(),
      usdcSac: this.sac(),
      usdcMode: supply.mode,
    };
  }

  /** Unsigned `changeTrust` to the platform USDC, for the wallet's owner to sign (Freighter). */
  trustlineXdr(wallet: string): Promise<string> {
    return this.sdex.buildTrustlineXdr(wallet, this.asset());
  }

  /** Whether the wallet already holds a trustline to the platform USDC. */
  async hasTrustline(wallet: string): Promise<boolean> {
    return (await this.sdex.trustlineState(wallet, this.asset())).exists;
  }

  /** Balance left in the demo pool (Circle mode); null when grants are minted. */
  async poolBalance(): Promise<number | null> {
    const supply = this.supply();
    if (supply.mode !== 'circle') return null;
    const pool = this.keyring.usdcPoolPublicKey();
    return pool ? this.balance(pool) : 0;
  }

  /** `setTrustLineFlags` when the issuer is ours and requires authorization (adds the issuer as signer). */
  private async authorizeOps(
    wallet: string,
    asset: Asset,
    authorized: boolean,
    signers: Keypair[],
  ): Promise<xdr.Operation[]> {
    if (authorized) return [];
    const authorizer = await this.supply().authorizer();
    if (!authorizer || authorizer.publicKey() !== asset.getIssuer()) return [];
    if (!(await this.sdex.issuerRequiresAuth(authorizer.publicKey()))) return [];
    if (!signers.some((k) => k.publicKey() === authorizer.publicKey())) signers.push(authorizer);
    return [
      Operation.setTrustLineFlags({
        trustor: wallet,
        asset,
        flags: { authorized: true },
        source: authorizer.publicKey(),
      }),
    ];
  }

  /** A pool payment can't mint: say how much is left instead of failing on-chain. */
  private async assertPoolCovers(payer: Keypair, asset: Asset, amount: number): Promise<void> {
    if (payer.publicKey() === asset.getIssuer()) return;
    const left = await this.accounts.assetBalance(
      payer.publicKey(),
      asset.getCode(),
      asset.getIssuer() ?? '',
    );
    if (left + 1e-7 < amount) {
      throw new DomainError(
        `El pool de USDC de demo tiene ${left.toFixed(2)} USDC y el envío es de ${amount}. ` +
          'Recargalo con npm run stellar:fund-pool o desde el faucet de Circle.',
      );
    }
  }

  private result(asset: Asset, balance: number, hash: string | null, already: boolean): UsdcFundResult {
    return {
      funded: true,
      already,
      balance,
      trustline: true,
      hash,
      explorer: this.explorer.tx(hash),
      issuer: asset.getIssuer() ?? '',
    };
  }

  private static grantGap(balance: number, grant: number, onlyIfEmpty?: boolean): number {
    if (onlyIfEmpty && balance > 0) return 0;
    return grant - balance;
  }
}
