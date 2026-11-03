/**
 * Network presets and the minimal Stellar wiring the Instaward 1 operator
 * commands need (`stellar:deploy`, `stellar:fund-pool`, `stellar:e2e`).
 *
 * Unlike `cliToolkit()` these commands do not load the API configuration:
 * they target a network chosen on the command line (`--network local|testnet`)
 * and write their own deployment / env files, so they also run against a
 * local `stellar/quickstart` node in CI.
 */
import path from 'path';
import { Asset, Horizon, Keypair, rpc } from '@stellar/stellar-sdk';
import { API_ROOT } from '../../config/env';
import type { INetworkSettingsProvider, NetworkSettings } from '../../domain/testnet/NetworkSettings';
import { FileDeploymentRegistry } from '../../infrastructure/stellar/DeploymentRegistry';
import { FriendbotClient } from '../../infrastructure/stellar/FriendbotClient';
import { SorobanGateway } from '../../infrastructure/stellar/SorobanGateway';
import { StellarClients } from '../../infrastructure/stellar/StellarClients';

export type NetworkName = 'local' | 'testnet';

export interface NetworkPreset {
  name: NetworkName;
  horizonUrl: string;
  rpcUrl: string;
  friendbotUrl: string;
  passphrase: string;
  explorerUrl: string;
}

/** Circle's USDC on Stellar testnet (https://developers.circle.com/stablecoins/usdc-contract-addresses). */
export const CIRCLE_TESTNET_USDC = {
  code: 'USDC',
  issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
  sac: 'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA',
} as const;

/** `PaymentKind` / `ProductKind` of the issuance factory (contracts/issuance-factory). */
export const PAYMENT_KIND = { XLM: 0, USDC: 1 } as const;
export const PRODUCT_KIND = { Licitacion: 0, Forward: 1, Warrant: 2, Stock: 3 } as const;

/**
 * Endpoints per network. Every value can be overridden with the usual env
 * variables (STELLAR_RPC_URL…) — e.g. a dedicated testnet RPC for the demo.
 */
export function networkPreset(name: NetworkName): NetworkPreset {
  const env = process.env;
  if (name === 'local') {
    const base = (env.STELLAR_LOCAL_URL || 'http://localhost:8000').replace(/\/+$/, '');
    return {
      name,
      horizonUrl: env.STELLAR_HORIZON_URL || base,
      rpcUrl: env.STELLAR_RPC_URL || `${base}/rpc`,
      friendbotUrl: env.STELLAR_FRIENDBOT_URL || `${base}/friendbot`,
      passphrase: env.STELLAR_NETWORK_PASSPHRASE || 'Standalone Network ; February 2017',
      // There is no public explorer for a throwaway local network.
      explorerUrl: env.STELLAR_EXPLORER_URL || 'https://stellar.expert/explorer/testnet',
    };
  }
  return {
    name,
    horizonUrl: env.STELLAR_HORIZON_URL || 'https://horizon-testnet.stellar.org',
    rpcUrl: env.STELLAR_RPC_URL || 'https://soroban-testnet.stellar.org',
    friendbotUrl: env.STELLAR_FRIENDBOT_URL || 'https://friendbot.stellar.org',
    passphrase: env.STELLAR_NETWORK_PASSPHRASE || 'Test SDF Network ; September 2015',
    explorerUrl: env.STELLAR_EXPLORER_URL || 'https://stellar.expert/explorer/testnet',
  };
}

/** Default output paths: under the API's gitignored `.local-data/<network>/`. */
export function defaultPaths(name: NetworkName): { deployment: string; env: string } {
  const dir = path.join(API_ROOT, '.local-data', name);
  return { deployment: path.join(dir, 'deployment.json'), env: path.join(dir, '.env') };
}

export interface StellarContext {
  preset: NetworkPreset;
  clients: StellarClients;
  horizon: Horizon.Server;
  rpc: rpc.Server;
  soroban: SorobanGateway;
  friendbot: FriendbotClient;
  deployments: FileDeploymentRegistry;
  /** Stellar Expert link for a transaction (null on a local network). */
  txLink(hash: string | null | undefined): string | null;
  contractLink(id: string): string | null;
  /** Native XLM's Stellar Asset Contract on this network. */
  xlmSac(): string;
}

export function stellarContext(preset: NetworkPreset, deploymentFile: string): StellarContext {
  const settings: NetworkSettings = {
    mode: 'deploy',
    friendbot: true,
    horizonUrl: preset.horizonUrl,
    rpcUrl: preset.rpcUrl,
    networkPassphrase: preset.passphrase,
    notes: '',
    settlePolicy: 'ON_MIN',
    updatedAt: new Date().toISOString(),
  };
  const provider: INetworkSettingsProvider = { get: () => settings };
  const clients = new StellarClients(provider);
  const deployments = new FileDeploymentRegistry(deploymentFile);
  const explorer = preset.name === 'testnet' ? preset.explorerUrl.replace(/\/+$/, '') : null;
  return {
    preset,
    clients,
    horizon: clients.horizon(),
    rpc: clients.rpc(),
    soroban: new SorobanGateway(clients, deployments),
    friendbot: new FriendbotClient(preset.friendbotUrl, clients),
    deployments,
    txLink: (hash) => (explorer && hash ? `${explorer}/tx/${hash}` : null),
    contractLink: (id) => (explorer ? `${explorer}/contract/${id}` : null),
    xlmSac: () => Asset.native().contractId(preset.passphrase),
  };
}

/** Horizon answers it while it is still catching up with the ledger (fresh quickstart, busy testnet). */
const TRANSIENT_HORIZON = new Set([404, 429, 502, 503, 504]);

function horizonStatus(err: unknown): number | undefined {
  return (err as { response?: { status?: number } })?.response?.status;
}

/**
 * Loads an account from Horizon, waiting out the lag between a ledger closing
 * and Horizon ingesting it: an account Friendbot just created can 404, and a
 * local Horizon still starting answers 503. Any other error is thrown as is.
 */
export async function loadAccountReady(
  ctx: StellarContext,
  publicKey: string,
  { attempts = 30, delayMs = 2000 }: { attempts?: number; delayMs?: number } = {},
): Promise<Horizon.AccountResponse> {
  for (let i = 1; ; i++) {
    try {
      return await ctx.horizon.loadAccount(publicKey);
    } catch (err) {
      const status = horizonStatus(err);
      if (i >= attempts || status === undefined || !TRANSIENT_HORIZON.has(status)) throw err;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

/**
 * Funds an account through Friendbot (testnet and quickstart both expose one)
 * and returns once Horizon serves it, so the next transaction can load it.
 */
export async function fundAccount(ctx: StellarContext, publicKey: string, label: string): Promise<void> {
  const res = await ctx.friendbot.fund(publicKey);
  if (!res.funded && !res.already) throw new Error(`Friendbot no fondeó ${label} (${publicKey})`);
  try {
    await loadAccountReady(ctx, publicKey);
  } catch (err) {
    throw new Error(`Horizon no muestra ${label} (${publicKey}) después de fondearla: ${String(err)}`);
  }
}

export async function accountExists(ctx: StellarContext, publicKey: string): Promise<boolean> {
  try {
    await ctx.horizon.loadAccount(publicKey);
    return true;
  } catch {
    return false;
  }
}

/** Parses `--flag value` / `--flag=value` / `--flag` (boolean) arguments. */
export function parseArgs(argv: string[]): Record<string, string | true> {
  const out: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const eq = arg.indexOf('=');
    if (eq > 0) {
      out[arg.slice(2, eq)] = arg.slice(eq + 1);
    } else if (argv[i + 1] !== undefined && !argv[i + 1].startsWith('--')) {
      out[arg.slice(2)] = argv[++i];
    } else {
      out[arg.slice(2)] = true;
    }
  }
  return out;
}

export function networkArg(args: Record<string, string | true>): NetworkName {
  const n = args.network ?? process.env.STELLAR_NETWORK_NAME ?? 'testnet';
  if (n !== 'local' && n !== 'testnet') throw new Error('--network tiene que ser local o testnet');
  return n;
}

export function keypairFrom(secret: string | undefined): Keypair | null {
  if (!secret || !secret.startsWith('S')) return null;
  try {
    return Keypair.fromSecret(secret);
  } catch {
    return null;
  }
}

/* eslint-disable no-console */
export const log = (msg: string, extra?: Record<string, unknown>) =>
  console.log(extra ? `${msg} ${JSON.stringify(extra)}` : msg);
