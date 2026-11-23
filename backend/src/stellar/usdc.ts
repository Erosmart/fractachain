/**
 * Testnet USDC faucet + trustline plumbing.
 *
 * Friendbot only ever funds native XLM, so "USDC de prueba" has to come from
 * an issuer the platform controls. The issuer lives in
 * STELLAR_USDC_ISSUER_SECRET and is deliberately a separate account from the
 * security-token issuer: that account runs AUTH_REQUIRED (every trustline
 * would need issuer sign-off, killing the faucet UX), this one does not.
 *
 * The licitación contract pulls the payment token via its SAC, whose address
 * is recorded as `usdcSac` in deployments/testnet.json.
 */
import {
  Asset,
  BASE_FEE,
  Horizon,
  Keypair,
  Operation,
  TransactionBuilder,
} from '@stellar/stellar-sdk';
import { getTestnetConfig } from '../admin/testnet';
import { fundFriendbot, isStellarPublicKey, loadAssetBalance, loadNativeXlm, topUpXlm } from '../auth/stellar_testnet';
import { usdcIssuerKeypair, usdcIssuerPublicKey } from './keys';
import { loadTestnetDeployment } from './deployment';
import {
  describeHorizonError,
  getTrustlineState,
  toStellarAmount,
} from './sdex';
import { explorerTx } from './onchain';

export const USDC_CODE = 'USDC';
/** Wallet top-up granted on hydrate / fund clicks. */
const USDC_GRANT = Math.max(1, Number(process.env.STELLAR_USDC_GRANT || 10_000));
const FEE = String(Number(BASE_FEE) * 100);
const TX_TIMEOUT_SECONDS = 180;

/** Marker thrown when the wallet must sign its own trustline first. */
export const USDC_NEEDS_TRUSTLINE = 'USDC_NEEDS_TRUSTLINE';

let horizon: Horizon.Server | null = null;
let horizonBound = '';

function server() {
  const url = getTestnetConfig().horizonUrl;
  if (!horizon || horizonBound !== url) {
    horizon = new Horizon.Server(url);
    horizonBound = url;
  }
  return horizon;
}

function networkPassphrase() {
  return getTestnetConfig().networkPassphrase;
}

export function usdcAsset(): Asset {
  const issuer = usdcIssuerPublicKey();
  if (!issuer || !isStellarPublicKey(issuer)) {
    throw new Error('Falta el emisor USDC de testnet (STELLAR_USDC_ISSUER_SECRET)');
  }
  return new Asset(USDC_CODE, issuer);
}

export function usdcAssetDescriptor() {
  const issuer = usdcIssuerPublicKey();
  return {
    code: USDC_CODE,
    issuer,
    sac: loadTestnetDeployment()?.usdcSac || null,
  };
}

export async function usdcBalance(publicKey: string): Promise<number> {
  const issuer = usdcIssuerPublicKey();
  if (!issuer) return 0;
  return loadAssetBalance(publicKey, USDC_CODE, issuer);
}

async function issuerRequiresAuth(issuer: string): Promise<boolean> {
  try {
    const account = await server().loadAccount(issuer);
    return Boolean((account as any).flags?.auth_required);
  } catch {
    return false;
  }
}

async function submitTx(sourcePublicKey: string, ops: any[], signers: Keypair[]) {
  const srv = server();
  const account = await srv.loadAccount(sourcePublicKey);
  const builder = new TransactionBuilder(account, {
    fee: FEE,
    networkPassphrase: networkPassphrase(),
  });
  ops.forEach((op) => builder.addOperation(op));
  const tx = builder.setTimeout(TX_TIMEOUT_SECONDS).build();
  signers.forEach((s) => tx.sign(s));
  try {
    return await srv.submitTransaction(tx);
  } catch (err: any) {
    throw new Error(describeHorizonError(err));
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

/**
 * Issues `grant` USDC to `wallet`, creating/authorizing the trustline when
 * `walletSecret` is available (custodial wallets and demo treasuries).
 * Without the wallet secret a missing trustline throws `USDC_NEEDS_TRUSTLINE`
 * so the caller can hand the user a `changeTrust` XDR instead.
 */
/**
 * Automatic heals must never top a wallet back up: that would silently undo
 * every purchase. Only a wallet holding no USDC at all — free or locked in
 * open offers — qualifies for the grant.
 */
function grantGap(line: { balance: number }, grant: number, onlyIfEmpty?: boolean) {
  if (onlyIfEmpty && line.balance > 0) return 0;
  return grant - line.balance;
}

export async function fundTestnetUsdc(
  wallet: string,
  opts?: { walletSecret?: string | null; grant?: number; onlyIfEmpty?: boolean },
): Promise<UsdcFundResult> {
  const issuer = await usdcIssuerKeypair();
  const asset = usdcAsset();
  const grant = opts?.grant ?? USDC_GRANT;

  const fundedXlm = await fundFriendbot(wallet).catch(() => ({ funded: false }));
  void fundedXlm;
  const line = await getTrustlineState(wallet, asset);
  const needsAuth = await issuerRequiresAuth(issuer.publicKey());

  if (!line.exists && !opts?.walletSecret) {
    throw new Error(USDC_NEEDS_TRUSTLINE);
  }

  const ops: any[] = [];
  const signers: Keypair[] = [issuer];
  if (!line.exists) {
    const walletKp = Keypair.fromSecret(opts!.walletSecret!);
    signers.push(walletKp);
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
  const gap = grantGap(line, grant, opts?.onlyIfEmpty);
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
  if (!ops.length) {
    return {
      funded: true,
      already: true,
      balance: line.balance,
      trustline: true,
      hash: null,
      explorer: null,
      issuer: issuer.publicKey(),
    };
  }
  const result = await submitTx(issuer.publicKey(), ops, signers);
  const balance = await usdcBalance(wallet);
  return {
    funded: true,
    already: false,
    balance,
    trustline: true,
    hash: (result as any).hash || null,
    explorer: explorerTx((result as any).hash),
    issuer: issuer.publicKey(),
  };
}

/**
 * Issuer-side top-up for a wallet that already opened its trustline — used by
 * the self-custody flow right after the user signs `changeTrust` in Freighter.
 */
export async function payUsdcGrant(
  wallet: string,
  opts?: { onlyIfEmpty?: boolean },
): Promise<UsdcFundResult> {
  const issuer = await usdcIssuerKeypair();
  const asset = usdcAsset();
  const line = await getTrustlineState(wallet, asset);
  if (!line.exists) {
    throw new Error('La wallet todavía no tiene trustline USDC: firmá el changeTrust primero');
  }
  const needsAuth = await issuerRequiresAuth(issuer.publicKey());
  const ops: any[] = [];
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
  const gap = grantGap(line, USDC_GRANT, opts?.onlyIfEmpty);
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
  if (!ops.length) {
    return {
      funded: true,
      already: true,
      balance: line.balance,
      trustline: true,
      hash: null,
      explorer: null,
      issuer: issuer.publicKey(),
    };
  }
  const result = await submitTx(issuer.publicKey(), ops, [issuer]);
  const balance = await usdcBalance(wallet);
  return {
    funded: true,
    already: false,
    balance,
    trustline: true,
    hash: (result as any).hash || null,
    explorer: explorerTx((result as any).hash),
    issuer: issuer.publicKey(),
  };
}

/**
 * Ensures the fiduciary (company) wallet can receive USDC. Returns true when
 * the trustline is ready; false means the company must open it themselves
 * before finalize() can pay out — surfaced to the admin, never silently.
 */
export async function ensureFiduciaryUsdcTrustline(
  wallet: string,
  walletSecret?: string | null,
): Promise<boolean> {
  const asset = usdcAsset();
  const line = await getTrustlineState(wallet, asset);
  if (line.exists && line.authorized) return true;
  if (!line.exists && !walletSecret) return false;
  const issuer = await usdcIssuerKeypair();
  const needsAuth = await issuerRequiresAuth(issuer.publicKey());
  const ops: any[] = [];
  const signers: Keypair[] = [issuer];
  if (!line.exists) {
    const walletKp = Keypair.fromSecret(walletSecret!);
    signers.push(walletKp);
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
  await submitTx(issuer.publicKey(), ops, signers);
  const after = await getTrustlineState(wallet, asset);
  return after.exists && after.authorized;
}

/**
 * One-stop wallet funding check used by hydrate + the read endpoints:
 *
 * 1. Friendbot creates the account when missing (10k XLM).
 * 2. `topUpXlm` refills live-but-broke wallets from the deployer — plain
 *    payments need no recipient signature, so even self-custody gets it.
 * 3. USDC trustline + grant: signed by the backend only when `walletSecret`
 *    exists (custodial). Self-custody without a trustline is skipped — the
 *    holder signs `changeTrust` once via the UI flow, nothing else works.
 */
export async function ensureWalletFunded(
  wallet: string,
  opts?: { walletSecret?: string | null },
): Promise<unknown> {
  await fundFriendbot(wallet).catch(() => undefined);
  await topUpXlm(wallet).catch(() => undefined);
  if (opts?.walletSecret) {
    return fundTestnetUsdc(wallet, { walletSecret: opts.walletSecret, onlyIfEmpty: true });
  }
  const line = await getTrustlineState(wallet, usdcAsset());
  if (line.exists) return payUsdcGrant(wallet, { onlyIfEmpty: true });
  return { funded: false, trustline: false };
}

/** Snapshot for the wallet page: XLM + USDC under the platform issuer. */
export async function walletFunds(publicKey: string) {
  const issuer = usdcIssuerPublicKey();
  const [xlm, usdc] = await Promise.all([
    loadNativeXlm(publicKey),
    issuer ? loadAssetBalance(publicKey, USDC_CODE, issuer) : Promise.resolve(0),
  ]);
  return {
    xlm,
    usdc,
    usdcIssuer: issuer,
    usdcCode: USDC_CODE,
    usdcSac: loadTestnetDeployment()?.usdcSac || null,
  };
}
