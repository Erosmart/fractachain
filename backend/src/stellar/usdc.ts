/**
 * Testnet USDC faucet + trustline plumbing.
 *
 * Friendbot only ever funds native XLM, so "USDC de prueba" comes from one of
 * two sources, picked by which asset deployments/testnet.json settles in:
 *
 * - Circle's USDC (default): the platform cannot mint it, so grants are
 *   transfers out of the demo pool (STELLAR_USDC_TREASURY_SECRET), topped up
 *   from faucet.circle.com.
 * - Platform-issued USDC (fallback): the issuer key mints the grant. That
 *   issuer is deliberately separate from the security-token issuer, which runs
 *   AUTH_REQUIRED and would need to sign off every trustline.
 *
 * The licitación contract pulls the payment token via the SAC of that same
 * asset (`usdcSacId`).
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
import { fundFriendbot, loadAssetBalance, loadNativeXlm, topUpXlm } from '../auth/stellar_testnet';
import {
  isCircleUsdc,
  usdcClassicAsset,
  usdcCode,
  usdcIssuerKeypair,
  usdcIssuerPublicKey,
  usdcMintKeypair,
  usdcSacId,
  usdcTreasuryKeypair,
} from './keys';
import {
  describeHorizonError,
  getTrustlineState,
  toStellarAmount,
} from './sdex';
import { explorerTx } from './onchain';

export const USDC_CODE = usdcCode();
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
  return usdcClassicAsset();
}

function sacOrNull(): string | null {
  try {
    return usdcSacId();
  } catch {
    return null;
  }
}

export function usdcAssetDescriptor() {
  return {
    code: USDC_CODE,
    issuer: usdcIssuerPublicKey(),
    sac: sacOrNull(),
    circle: isCircleUsdc(),
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

/**
 * Who pays a grant: the issuer mints when the platform holds its key (own
 * asset); otherwise the demo treasury transfers from its Circle USDC pool.
 */
async function usdcSource(): Promise<{ kp: Keypair; mints: boolean }> {
  const minter = usdcMintKeypair();
  if (minter) return { kp: minter, mints: true };
  const treasury = usdcTreasuryKeypair();
  if (treasury) return { kp: treasury, mints: false };
  const issuer = usdcIssuerPublicKey();
  // Fresh clone with no USDC configured at all: provision a platform issuer.
  if (!issuer) return { kp: await usdcIssuerKeypair(), mints: true };
  throw new Error(
    `No hay de dónde fondear USDC ${issuer}: configurá STELLAR_USDC_TREASURY_SECRET con una wallet ` +
      'que tenga USDC de Circle (faucet.circle.com) o corré npm run usdc:set -- circle para provisionarla.',
  );
}

/**
 * Default grant per wallet. Minting is free, but every Circle grant drains a
 * pool fed by a faucet that pays 20 USDC every 2 hours, so it stays small
 * unless STELLAR_USDC_GRANT says otherwise.
 */
function defaultGrant(mints: boolean): number {
  const configured = Number(process.env.STELLAR_USDC_GRANT);
  if (Number.isFinite(configured) && configured > 0) return configured;
  return mints ? 10_000 : 5;
}

export interface UsdcFundResult {
  funded: boolean;
  already: boolean;
  balance: number;
  trustline: boolean;
  hash: string | null;
  explorer: string | null;
  issuer: string;
  source: 'mint' | 'treasury';
}

/**
 * Automatic heals must never top a wallet back up: that would silently undo
 * every purchase. Only a wallet holding no USDC at all — free or locked in
 * open offers — qualifies for the grant.
 */
function grantGap(line: { balance: number }, grant: number, onlyIfEmpty?: boolean) {
  if (onlyIfEmpty && line.balance > 0) return 0;
  return grant - line.balance;
}

/** `setTrustLineFlags` is only possible (and only needed) with the issuer key. */
async function authorizeOps(
  wallet: string,
  asset: Asset,
  line: { authorized: boolean },
  source: { kp: Keypair; mints: boolean },
) {
  if (line.authorized || !(await issuerRequiresAuth(asset.issuer!))) return [];
  if (!source.mints) {
    throw new Error(`El emisor ${asset.issuer} exige autorizar la trustline y la plataforma no tiene su clave`);
  }
  return [
    Operation.setTrustLineFlags({
      trustor: wallet,
      asset,
      flags: { authorized: true },
      source: source.kp.publicKey(),
    }),
  ];
}

async function grantOps(
  wallet: string,
  asset: Asset,
  gap: number,
  source: { kp: Keypair; mints: boolean },
) {
  if (gap <= 0) return [];
  if (!source.mints) {
    if (source.kp.publicKey() === wallet) return [];
    const pool = await loadAssetBalance(source.kp.publicKey(), asset.code, asset.issuer!);
    if (pool < gap) {
      throw new Error(
        `El pool de USDC de demo (${source.kp.publicKey()}) tiene ${pool.toFixed(2)} USDC y hacen falta ${gap}. ` +
          'Recargalo desde faucet.circle.com (Stellar Testnet).',
      );
    }
  }
  return [
    Operation.payment({
      destination: wallet,
      asset,
      amount: toStellarAmount(gap),
      source: source.kp.publicKey(),
    }),
  ];
}

async function grantUsdc(
  wallet: string,
  opts: { walletSecret?: string | null; grant?: number; onlyIfEmpty?: boolean; missingTrustline: string },
): Promise<UsdcFundResult> {
  const source = await usdcSource();
  const asset = usdcAsset();
  const line = await getTrustlineState(wallet, asset);
  if (!line.exists && !opts.walletSecret) throw new Error(opts.missingTrustline);

  const ops: any[] = [];
  const signers: Keypair[] = [source.kp];
  if (!line.exists) {
    signers.push(Keypair.fromSecret(opts.walletSecret!));
    ops.push(Operation.changeTrust({ asset, source: wallet }));
  }
  ops.push(...(await authorizeOps(wallet, asset, line, source)));
  const gap = grantGap(line, opts.grant ?? defaultGrant(source.mints), opts.onlyIfEmpty);
  ops.push(...(await grantOps(wallet, asset, gap, source)));

  const base = {
    funded: true,
    trustline: true,
    issuer: asset.issuer!,
    source: source.mints ? ('mint' as const) : ('treasury' as const),
  };
  if (!ops.length) {
    return { ...base, already: true, balance: line.balance, hash: null, explorer: null };
  }
  const result = await submitTx(source.kp.publicKey(), ops, signers);
  const hash = (result as any).hash || null;
  return {
    ...base,
    already: false,
    balance: await usdcBalance(wallet),
    hash,
    explorer: explorerTx(hash),
  };
}

/**
 * Grants `grant` USDC to `wallet`, creating/authorizing the trustline when
 * `walletSecret` is available (custodial wallets and demo treasuries).
 * Without the wallet secret a missing trustline throws `USDC_NEEDS_TRUSTLINE`
 * so the caller can hand the user a `changeTrust` XDR instead.
 */
export async function fundTestnetUsdc(
  wallet: string,
  opts?: { walletSecret?: string | null; grant?: number; onlyIfEmpty?: boolean },
): Promise<UsdcFundResult> {
  await fundFriendbot(wallet).catch(() => undefined);
  return grantUsdc(wallet, { ...opts, missingTrustline: USDC_NEEDS_TRUSTLINE });
}

/**
 * Grant for a wallet that already opened its trustline — used by the
 * self-custody flow right after the user signs `changeTrust` in Freighter.
 */
export async function payUsdcGrant(
  wallet: string,
  opts?: { onlyIfEmpty?: boolean },
): Promise<UsdcFundResult> {
  return grantUsdc(wallet, {
    onlyIfEmpty: opts?.onlyIfEmpty,
    missingTrustline: 'La wallet todavía no tiene trustline USDC: firmá el changeTrust primero',
  });
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

  const minter = usdcMintKeypair();
  const needsAuth = await issuerRequiresAuth(asset.issuer!);
  if (needsAuth && !line.authorized && !minter) return false;

  const ops: any[] = [];
  const signers: Keypair[] = [];
  if (!line.exists) {
    signers.push(Keypair.fromSecret(walletSecret!));
    ops.push(Operation.changeTrust({ asset, source: wallet }));
  }
  if (needsAuth && !line.authorized) {
    signers.push(minter!);
    ops.push(
      Operation.setTrustLineFlags({
        trustor: wallet,
        asset,
        flags: { authorized: true },
        source: minter!.publicKey(),
      }),
    );
  }
  if (!ops.length) return line.exists && (!needsAuth || line.authorized);
  await submitTx(signers[0].publicKey(), ops, signers);
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

/** Snapshot for the wallet page: XLM + the USDC the licitaciones settle in. */
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
    usdcSac: sacOrNull(),
    usdcCircle: isCircleUsdc(),
  };
}

/** Demo pool status for the admin / setup script. */
export async function usdcTreasuryStatus() {
  const treasury = usdcTreasuryKeypair();
  const minter = usdcMintKeypair();
  const asset = usdcAsset();
  const pool = treasury ? await getTrustlineState(treasury.publicKey(), asset) : null;
  return {
    asset: `${asset.code}:${asset.issuer}`,
    sac: usdcSacId(),
    circle: isCircleUsdc(),
    mode: minter ? ('mint' as const) : treasury ? ('treasury' as const) : ('none' as const),
    treasury: treasury?.publicKey() || null,
    treasuryTrustline: pool?.exists ?? false,
    treasuryBalance: pool?.balance ?? 0,
    grant: defaultGrant(Boolean(minter)),
  };
}
