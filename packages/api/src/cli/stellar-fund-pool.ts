/**
 * Demo USDC pool (Instaward 1): the account the reviewer funding helper pays
 * test USDC from (`POST /api/wallet/usdc/fund`, `npm run stellar:fund`).
 *
 * testnet — Circle's USDC cannot be minted by the team: it is bought on the
 *   testnet DEX with Friendbot XLM (throwaway accounts, merged back into the
 *   pool afterwards). Circle's faucet (faucet.circle.com) also works: send
 *   its USDC to the pool address this command prints.
 * local   — the team issuer mints the requested amount.
 *
 *   npm run stellar:fund-pool -- --network testnet --usdc 2000 [--env-out <file>] [--out <file>]
 */
import path from 'path';
import { Asset, Keypair } from '@stellar/stellar-sdk';
import { balanceOf, buyWithFriendbotXlm, ensureTrustline, pay } from './stellar/classic';
import { readEnvFile, writeEnvFile } from './stellar/env-file';
import {
  CIRCLE_TESTNET_USDC,
  accountExists,
  defaultPaths,
  fundAccount,
  keypairFrom,
  log,
  networkArg,
  networkPreset,
  parseArgs,
  stellarContext,
} from './stellar/network';
import { runCli } from './toolkit';

const cwd = process.env.INIT_CWD || process.cwd();

runCli(async () => {
  const args = parseArgs(process.argv.slice(2));
  const network = networkArg(args);
  const preset = networkPreset(network);
  const defaults = defaultPaths(network);
  const envOut = path.resolve(cwd, String(args['env-out'] ?? defaults.env));
  const out = path.resolve(cwd, String(args.out ?? defaults.deployment));
  const target = Number(args.usdc ?? 2000);
  if (!(target > 0)) throw new Error('--usdc tiene que ser un monto positivo');

  const ctx = stellarContext(preset, out);
  const env = readEnvFile(envOut);
  const usdcMode = (process.env.USDC_MODE || env.USDC_MODE || (network === 'testnet' ? 'circle' : 'team')) as
    'circle' | 'team';
  const teamIssuer = keypairFrom(process.env.STELLAR_USDC_ISSUER_SECRET || env.STELLAR_USDC_ISSUER_SECRET);
  if (usdcMode === 'team' && !teamIssuer) {
    throw new Error('Modo team sin STELLAR_USDC_ISSUER_SECRET: corré antes stellar:deploy');
  }
  const asset =
    usdcMode === 'circle'
      ? new Asset(CIRCLE_TESTNET_USDC.code, CIRCLE_TESTNET_USDC.issuer)
      : new Asset('USDC', teamIssuer!.publicKey());

  let pool = keypairFrom(process.env.STELLAR_USDC_POOL_SECRET || env.STELLAR_USDC_POOL_SECRET);
  if (!pool) {
    pool = Keypair.random();
    log(`Pool nuevo: ${pool.publicKey()}`);
  }
  if (!(await accountExists(ctx, pool.publicKey()))) await fundAccount(ctx, pool.publicKey(), 'pool de USDC');
  await ensureTrustline(ctx, pool, asset);
  writeEnvFile(envOut, { STELLAR_USDC_POOL_SECRET: pool.secret() }, `stellar:fund-pool ${network}`);

  const before = (await balanceOf(ctx, pool.publicKey(), asset)) ?? 0;
  log(`Pool ${pool.publicKey()} · ${before.toFixed(2)} ${asset.getCode()} (objetivo ${target})`);
  if (before >= target) {
    log('El pool ya tiene el saldo pedido.');
    return;
  }
  const missing = target - before;
  if (usdcMode === 'team') {
    await pay(ctx, teamIssuer!, pool.publicKey(), asset, missing);
  } else {
    const { delivered } = await buyWithFriendbotXlm(ctx, pool, asset, missing);
    log(`Comprados ${delivered.toFixed(2)} USDC de Circle en el DEX de testnet.`);
  }
  const after = (await balanceOf(ctx, pool.publicKey(), asset)) ?? 0;
  log(`Pool ${pool.publicKey()} · ${after.toFixed(2)} ${asset.getCode()}`);
  if (after < target) {
    log(
      `No alcanzó el objetivo (liquidez del DEX). Completá con el faucet de Circle: https://faucet.circle.com → Stellar testnet → ${pool.publicKey()}`,
    );
  }
});
