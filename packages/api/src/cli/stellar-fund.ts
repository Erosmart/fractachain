/**
 * Reviewer funding helper (CLI): sends test USDC from the demo pool to any
 * account that already trusts the platform USDC. The web does the same for a
 * signed-in investor through `POST /api/wallet/usdc/fund`.
 *
 *   npm run stellar:fund -- G… [amount] [--network testnet] [--env-out <file>]
 */
import path from 'path';
import { Asset, StrKey } from '@stellar/stellar-sdk';
import { balanceOf, pay } from './stellar/classic';
import { readEnvFile } from './stellar/env-file';
import {
  CIRCLE_TESTNET_USDC,
  defaultPaths,
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
  const argv = process.argv.slice(2);
  const args = parseArgs(argv);
  const [to, amountArg] = argv.filter((a, i) => !a.startsWith('--') && !argv[i - 1]?.startsWith('--'));
  if (!StrKey.isValidEd25519PublicKey(to ?? '')) throw new Error('Uso: stellar:fund -- G… [monto]');
  const amount = Number(amountArg ?? 100);
  if (!(amount > 0 && amount <= 1000)) throw new Error('Monto entre 0 y 1.000 USDC');

  const network = networkArg(args);
  const preset = networkPreset(network);
  const defaults = defaultPaths(network);
  const env = readEnvFile(path.resolve(cwd, String(args['env-out'] ?? defaults.env)));
  const ctx = stellarContext(preset, path.resolve(cwd, String(args.out ?? defaults.deployment)));
  const pool = keypairFrom(process.env.STELLAR_USDC_POOL_SECRET || env.STELLAR_USDC_POOL_SECRET);
  if (!pool) throw new Error('Falta STELLAR_USDC_POOL_SECRET: corré stellar:deploy / stellar:fund-pool');
  const usdcMode = process.env.USDC_MODE || env.USDC_MODE || (network === 'testnet' ? 'circle' : 'team');
  const asset =
    usdcMode === 'circle'
      ? new Asset(CIRCLE_TESTNET_USDC.code, CIRCLE_TESTNET_USDC.issuer)
      : new Asset(env.STELLAR_USDC_CODE || 'USDC', env.STELLAR_USDC_ISSUER);

  if ((await balanceOf(ctx, to, asset)) === null) {
    throw new Error(
      `${to} no tiene trustline a ${asset.getCode()}: abrila en Freighter (o desde la app) y reintentá`,
    );
  }
  const hash = await pay(ctx, pool, to, asset, amount);
  log(`Enviados ${amount} ${asset.getCode()} a ${to}`, { tx: hash, explorer: ctx.txLink(hash) });
});
