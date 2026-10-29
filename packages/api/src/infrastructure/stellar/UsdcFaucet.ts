/**
 * Testnet USDC faucet + trustline plumbing.
 *
 * Friendbot only funds XLM, so "USDC de prueba" comes from an issuer the
 * platform controls (`STELLAR_USDC_ISSUER_SECRET`). It is deliberately a
 * different account from the security-token issuer: that one runs
 * `AUTH_REQUIRED`, which would make every USDC trustline need sign-off.
 */
import { Asset, Keypair, Operation, type xdr } from '@stellar/stellar-sdk';
import { isStellarPublicKey } from '../../domain/stellar/StellarAddress';
import { NotConfiguredError } from '../../shared/errors';
import type { DeploymentRegistryLike } from './types';
import type { Explorer } from './Explorer';
import type { IFriendbot } from './FriendbotClient';
import type { HorizonAccounts } from './HorizonAccounts';
import type { PlatformKeyring } from './PlatformKeyring';
import { toStellarAmount, type SdexGateway } from './SdexGateway';

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

export class UsdcFaucet {
  constructor(
    private readonly code: string,
    private readonly defaultGrant: number,
    private readonly keyring: PlatformKeyring,
    private readonly sdex: SdexGateway,
    private readonly accounts: HorizonAccounts,
    private readonly friendbot: IFriendbot,
    private readonly deployments: DeploymentRegistryLike,
    private readonly explorer: Explorer,
  ) {}

  issuerPublicKey(): string | null {
    return this.keyring.usdcIssuerPublicKey();
  }

  asset(): Asset {
    const issuer = this.issuerPublicKey();
    if (!isStellarPublicKey(issuer)) {
      throw new NotConfiguredError('Falta el emisor USDC de testnet (STELLAR_USDC_ISSUER_SECRET)');
    }
    return new Asset(this.code, issuer);
  }

  async balance(publicKey: string): Promise<number> {
    const issuer = this.issuerPublicKey();
    return issuer ? this.accounts.assetBalance(publicKey, this.code, issuer) : 0;
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
    const issuer = await this.keyring.usdcIssuer();
    const asset = this.asset();
    const grant = opts?.grant ?? this.defaultGrant;

    await this.friendbot.fund(wallet).catch(() => undefined);
    const line = await this.sdex.trustlineState(wallet, asset);
    const needsAuth = await this.sdex.issuerRequiresAuth(issuer.publicKey());
    if (!line.exists && !opts?.walletSecret) throw new UsdcNeedsTrustlineError();

    const ops: xdr.Operation[] = [];
    const signers: Keypair[] = [issuer];
    if (!line.exists) {
      signers.push(Keypair.fromSecret(opts!.walletSecret!));
      ops.push(Operation.changeTrust({ asset, source: wallet }));
    }
    if (needsAuth && !line.authorized) {
      ops.push(
        Operation.setTrustLineFlags({
          trustor: wallet,
          asset,
          flags: { authorized: true },
          source: issuer.publicKey(),
        }),
      );
    }
    const gap = UsdcFaucet.grantGap(line.balance, grant, opts?.onlyIfEmpty);
    if (gap > 0) {
      ops.push(
        Operation.payment({
          destination: wallet,
          asset,
          amount: toStellarAmount(gap),
          source: issuer.publicKey(),
        }),
      );
    }
    if (!ops.length) return this.result(issuer, line.balance, null, true);
    const submitted = await this.sdex.buildAndSubmit(
      issuer.publicKey(),
      (b) => ops.reduce((acc, op) => acc.addOperation(op), b),
      signers,
    );
    return this.result(issuer, await this.balance(wallet), submitted.hash, false);
  }

  /** Issuer-side top-up for a wallet that already opened its trustline (self-custody path). */
  async payGrant(wallet: string, opts?: { onlyIfEmpty?: boolean }): Promise<UsdcFundResult> {
    const issuer = await this.keyring.usdcIssuer();
    const asset = this.asset();
    const line = await this.sdex.trustlineState(wallet, asset);
    if (!line.exists) throw new UsdcNeedsTrustlineError();
    const needsAuth = await this.sdex.issuerRequiresAuth(issuer.publicKey());
    const ops: xdr.Operation[] = [];
    if (needsAuth && !line.authorized) {
      ops.push(
        Operation.setTrustLineFlags({
          trustor: wallet,
          asset,
          flags: { authorized: true },
          source: issuer.publicKey(),
        }),
      );
    }
    const gap = UsdcFaucet.grantGap(line.balance, this.defaultGrant, opts?.onlyIfEmpty);
    if (gap > 0) {
      ops.push(
        Operation.payment({
          destination: wallet,
          asset,
          amount: toStellarAmount(gap),
          source: issuer.publicKey(),
        }),
      );
    }
    if (!ops.length) return this.result(issuer, line.balance, null, true);
    const submitted = await this.sdex.buildAndSubmit(
      issuer.publicKey(),
      (b) => ops.reduce((acc, op) => acc.addOperation(op), b),
      [issuer],
    );
    return this.result(issuer, await this.balance(wallet), submitted.hash, false);
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
    const issuer = await this.keyring.usdcIssuer();
    const needsAuth = await this.sdex.issuerRequiresAuth(issuer.publicKey());
    const ops: xdr.Operation[] = [];
    const signers: Keypair[] = [issuer];
    if (!line.exists) {
      signers.push(Keypair.fromSecret(walletSecret!));
      ops.push(Operation.changeTrust({ asset, source: wallet }));
    }
    if (needsAuth && !line.authorized) {
      ops.push(
        Operation.setTrustLineFlags({
          trustor: wallet,
          asset,
          flags: { authorized: true },
          source: issuer.publicKey(),
        }),
      );
    }
    if (!ops.length) return line.exists && (!needsAuth || line.authorized);
    await this.sdex.buildAndSubmit(
      issuer.publicKey(),
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
   */
  async ensureWalletFunded(wallet: string, opts?: { walletSecret?: string | null }): Promise<unknown> {
    await this.friendbot.fund(wallet).catch(() => undefined);
    await this.accounts.topUpXlm(wallet).catch(() => undefined);
    if (opts?.walletSecret) return this.fund(wallet, { walletSecret: opts.walletSecret, onlyIfEmpty: true });
    const line = await this.sdex.trustlineState(wallet, this.asset());
    if (line.exists) return this.payGrant(wallet, { onlyIfEmpty: true });
    return { funded: false, trustline: false };
  }

  /** Snapshot for the wallet page: XLM + platform USDC. */
  async walletFunds(publicKey: string) {
    const issuer = this.issuerPublicKey();
    const [xlm, usdc] = await Promise.all([
      this.accounts.nativeXlm(publicKey),
      issuer ? this.accounts.assetBalance(publicKey, this.code, issuer) : Promise.resolve(0),
    ]);
    return {
      xlm,
      usdc,
      usdcIssuer: issuer,
      usdcCode: this.code,
      usdcSac: this.deployments.load()?.usdcSac || null,
    };
  }

  private result(issuer: Keypair, balance: number, hash: string | null, already: boolean): UsdcFundResult {
    return {
      funded: true,
      already,
      balance,
      trustline: true,
      hash,
      explorer: this.explorer.tx(hash),
      issuer: issuer.publicKey(),
    };
  }

  private static grantGap(balance: number, grant: number, onlyIfEmpty?: boolean): number {
    if (onlyIfEmpty && balance > 0) return 0;
    return grant - balance;
  }
}
