/**
 * One-command deployment (Instaward 1): uploads the five contracts, deploys
 * the factory, configures USDC as the payment asset and seeds test instances
 * (stock vault, two USDC tenders, a forward and a warrant), then writes the
 * deployment file the API reads and an env file with the secrets.
 *
 *   npm run stellar:deploy -- --network testnet          # Circle's testnet USDC
 *   npm run stellar:deploy -- --network local            # quickstart --local, team-issued USDC
 *
 * Options:
 *   --out <file>        deployment JSON   (default packages/api/.local-data/<network>/deployment.json)
 *   --env-out <file>    secrets env file  (default packages/api/.local-data/<network>/.env)
 *   --usdc circle|team  payment asset (default: circle on testnet, team on local)
 *   --no-build          reuse contracts/target WASMs as they are
 *   --refund-minutes N  deadline of the refund-demo tender (default 120)
 *   --skip-seed         only contracts + USDC (no test instances)
 *
 * Re-running reuses the actors in --env-out and skips WASMs already uploaded.
 * deployments/testnet.json is only written when passed explicitly as --out.
 */
import { randomBytes, createHash } from 'crypto';
import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { Asset, Keypair, Operation } from '@stellar/stellar-sdk';
import { REPO_ROOT } from '../config/env';
import { isContractId } from '../domain/stellar/StellarAddress';
import { ensureTrustline, pay, swapXlmFor } from './stellar/classic';
import { tokenDecimals } from './stellar/token';
import { readEnvFile, writeEnvFile, type EnvMap } from './stellar/env-file';
import {
  CIRCLE_TESTNET_USDC,
  PAYMENT_KIND,
  PRODUCT_KIND,
  accountExists,
  defaultPaths,
  fundAccount,
  keypairFrom,
  log,
  networkArg,
  networkPreset,
  parseArgs,
  stellarContext,
  type StellarContext,
} from './stellar/network';
import { runCli } from './toolkit';

const WASM_DIR = path.join(REPO_ROOT, 'contracts', 'target', 'wasm32v1-none', 'release');
const WASMS = {
  factory: 'issuance_factory.wasm',
  licitacion: 'fractachain_licitacion.wasm',
  stockVault: 'stock_vault.wasm',
  forward: 'forward_contract.wasm',
  warrant: 'warrant_vault.wasm',
} as const;
type WasmName = keyof typeof WASMS;

const cwd = process.env.INIT_CWD || process.cwd();
const resolvePath = (p: string) => path.resolve(cwd, p);

function buildWasms(): void {
  log('Compilando contratos (cargo build --release --target wasm32v1-none)…');
  const cargoBin = path.join(os.homedir(), '.cargo', 'bin');
  const res = spawnSync('cargo', ['build', '--locked', '--release', '--target', 'wasm32v1-none'], {
    cwd: path.join(REPO_ROOT, 'contracts'),
    stdio: 'inherit',
    env: {
      ...process.env,
      PATH: `${process.env.PATH ?? ''}${path.delimiter}${cargoBin}`,
      SOROBAN_SDK_BUILD_SYSTEM_SUPPORTS_SPEC_SHAKING_V2: '1',
    },
  });
  if (res.status !== 0) throw new Error('cargo build falló');
}

/** Uploads a WASM unless the network already has it (content-addressed). */
async function uploadWasm(ctx: StellarContext, name: WasmName, uploader: Keypair): Promise<string> {
  const file = path.join(WASM_DIR, WASMS[name]);
  if (!fs.existsSync(file)) throw new Error(`Falta ${file}: corré sin --no-build o npm run contracts:build`);
  const wasm = fs.readFileSync(file);
  const hash = createHash('sha256').update(wasm).digest('hex');
  try {
    await ctx.rpc.getContractWasmByHash(Buffer.from(hash, 'hex'));
    log(`  ${name}: ya subido`, { hash, bytes: wasm.length });
  } catch {
    const { hash: tx } = await ctx.soroban.submitHostFunction(
      Operation.uploadContractWasm({ wasm }),
      uploader,
    );
    log(`  ${name}: subido`, { hash, bytes: wasm.length, tx });
  }
  return hash;
}

/** Deploys a Stellar Asset Contract; tolerates one that already exists. */
async function ensureSac(ctx: StellarContext, asset: Asset, payer: Keypair): Promise<string> {
  const id = asset.contractId(ctx.preset.passphrase);
  try {
    await ctx.soroban.submitHostFunction(Operation.createStellarAssetContract({ asset }), payer);
    log(`  SAC creado para ${asset.isNative() ? 'XLM' : asset.getCode()}`, { contract: id });
  } catch (err) {
    if (!/exist/i.test(String((err as Error).message ?? err))) throw err;
  }
  return id;
}

/** An actor from the env file / process env, or a fresh Friendbot-funded one. */
async function actor(ctx: StellarContext, env: EnvMap, key: string, label: string): Promise<Keypair> {
  const existing = keypairFrom(process.env[key] || env[key]);
  const kp = existing ?? Keypair.random();
  if (!(await accountExists(ctx, kp.publicKey()))) await fundAccount(ctx, kp.publicKey(), label);
  env[key] = kp.secret();
  log(`  ${label}: ${kp.publicKey()}${existing ? ' (reusado)' : ''}`);
  return kp;
}

const units = (amount: number, decimals: number) => BigInt(Math.round(amount * 10 ** decimals));
const nowSec = () => Math.floor(Date.now() / 1000);

runCli(async () => {
  const args = parseArgs(process.argv.slice(2));
  const network = networkArg(args);
  const preset = networkPreset(network);
  const defaults = defaultPaths(network);
  const out = resolvePath(String(args.out ?? defaults.deployment));
  const envOut = resolvePath(String(args['env-out'] ?? defaults.env));
  const usdcMode: 'circle' | 'team' =
    args.usdc === 'team' || args.usdc === 'circle' ? args.usdc : network === 'testnet' ? 'circle' : 'team';
  if (usdcMode === 'circle' && network !== 'testnet')
    throw new Error('El USDC de Circle sólo existe en testnet');
  const refundMinutes = Number(args['refund-minutes'] ?? 120);

  const ctx = stellarContext(preset, out);
  const env = readEnvFile(envOut);
  log(`Deploy Fractachain → ${network} (${preset.rpcUrl}) · USDC ${usdcMode}`, { out, envOut });

  if (!args['no-build']) buildWasms();

  /* ---------------------------------------------------------------- actors */
  log('Cuentas:');
  const deployer = await actor(ctx, env, 'STELLAR_DEPLOYER_SECRET', 'deployer / admin');
  const issuer = await actor(ctx, env, 'STELLAR_ISSUER_SECRET', 'emisor de tokens');
  const porOracle = await actor(ctx, env, 'STELLAR_POR_ORACLE_SECRET', 'oráculo PoR');
  const trustee = await actor(ctx, env, 'STELLAR_TRUSTEE_SECRET', 'fiduciario (cobra el finalize)');
  const pool = await actor(ctx, env, 'STELLAR_USDC_POOL_SECRET', 'pool de USDC de demo');
  const producer = await actor(ctx, env, 'STELLAR_DEMO_PRODUCER_SECRET', 'productor (forward/warrant)');
  const buyer = await actor(ctx, env, 'STELLAR_DEMO_BUYER_SECRET', 'comprador (forward)');
  const warrantera = await actor(ctx, env, 'STELLAR_DEMO_WARRANTERA_SECRET', 'warrantera');

  /* ---------------------------------------------------------------- WASMs */
  log('WASMs:');
  const hashes = {} as Record<WasmName, string>;
  for (const name of Object.keys(WASMS) as WasmName[]) hashes[name] = await uploadWasm(ctx, name, deployer);

  /* ---------------------------------------------------------------- assets */
  log('Activos:');
  const xlmSac = await ensureSac(ctx, Asset.native(), deployer);
  let usdcAsset: Asset;
  let usdcIssuer: Keypair | null = null;
  if (usdcMode === 'circle') {
    usdcAsset = new Asset(CIRCLE_TESTNET_USDC.code, CIRCLE_TESTNET_USDC.issuer);
    if (usdcAsset.contractId(preset.passphrase) !== CIRCLE_TESTNET_USDC.sac) {
      throw new Error('El SAC de USDC de Circle no coincide con el de esta red');
    }
  } else {
    usdcIssuer = await actor(ctx, env, 'STELLAR_USDC_ISSUER_SECRET', 'emisor USDC del equipo');
    usdcAsset = new Asset('USDC', usdcIssuer.publicKey());
    await ensureSac(ctx, usdcAsset, usdcIssuer);
  }
  const usdcSac = usdcAsset.contractId(preset.passphrase);
  const decimals = await tokenDecimals(ctx, usdcSac, deployer.publicKey());
  log(`  USDC ${usdcMode}: ${usdcAsset.getIssuer()} · SAC ${usdcSac} · ${decimals} decimales`);

  // Accounts that receive USDC through the SAC need the classic trustline.
  for (const [label, kp] of [
    ['pool', pool],
    ['fiduciario', trustee],
    ['comprador', buyer],
    ['productor', producer],
  ] as const) {
    const tx = await ensureTrustline(ctx, kp, usdcAsset);
    if (tx) log(`  trustline USDC (${label})`, { tx });
  }
  if (usdcIssuer) {
    // Team asset: the issuer mints the demo pool and the forward buyer's escrow.
    await pay(ctx, usdcIssuer, pool.publicKey(), usdcAsset, 100_000);
    await pay(ctx, usdcIssuer, buyer.publicKey(), usdcAsset, 100);
    log('  USDC del equipo emitido: 100.000 al pool, 100 al comprador');
  } else {
    // Circle: the forward buyer escrows 10 USDC bought with a bit of its Friendbot XLM.
    const { received, hash } = await swapXlmFor(ctx, buyer, usdcAsset, 150);
    log(`  comprador compró ${received.toFixed(2)} USDC en el DEX`, { tx: hash });
  }

  /* --------------------------------------------------------------- factory */
  log('Factory:');
  const previous = fs.existsSync(out)
    ? (JSON.parse(fs.readFileSync(out, 'utf8')) as Record<string, unknown>)
    : {};
  let factory = String(previous.factory ?? '');
  const reuseFactory =
    isContractId(factory) &&
    previous.factoryWasmHash === hashes.factory &&
    previous.deployer === deployer.publicKey() &&
    !args['new-factory'];
  if (reuseFactory) {
    log(`  reusada ${factory}`);
  } else {
    const deployed = await ctx.soroban.deployWithConstructor(hashes.factory, deployer, {
      admin: deployer.publicKey(),
    });
    factory = deployed.contractId;
    log(`  desplegada ${factory}`, { tx: deployed.hash });
  }
  const factoryClient = await ctx.soroban.client(factory, deployer);
  for (const [kind, token] of [
    [PAYMENT_KIND.XLM, xlmSac],
    [PAYMENT_KIND.USDC, usdcSac],
  ] as const) {
    const { hash } = await ctx.soroban.invoke(factoryClient, 'set_payment_asset', {
      admin: deployer.publicKey(),
      kind,
      token,
    });
    log(`  set_payment_asset(${kind === PAYMENT_KIND.USDC ? 'USDC' : 'XLM'})`, { token, tx: hash });
  }

  const deployment: Record<string, unknown> = {
    network: network === 'local' ? 'local' : 'testnet',
    updatedAt: new Date().toISOString(),
    horizon: preset.horizonUrl,
    rpc: preset.rpcUrl,
    passphrase: preset.passphrase,
    deployer: deployer.publicKey(),
    issuer: issuer.publicKey(),
    porOracle: porOracle.publicKey(),
    factory,
    factoryWasmHash: hashes.factory,
    licitacionWasmHash: hashes.licitacion,
    stockVaultWasmHash: hashes.stockVault,
    forwardWasmHash: hashes.forward,
    warrantWasmHash: hashes.warrant,
    xlmSac,
    usdcSac,
    usdcClassic: { code: usdcAsset.getCode(), issuer: usdcAsset.getIssuer() },
    usdc: {
      mode: usdcMode,
      code: usdcAsset.getCode(),
      issuer: usdcAsset.getIssuer(),
      sac: usdcSac,
      decimals,
    },
    usdcPool: pool.publicKey(),
    trustee: trustee.publicKey(),
    demo: { producer: producer.publicKey(), buyer: buyer.publicKey(), warrantera: warrantera.publicKey() },
    warrantFactory: factory,
    seeded: { tenders: [], forwards: [], warrants: [], stockVaults: [] },
  };

  /* ----------------------------------------------------------------- seeds */
  const seeded = deployment.seeded as Record<string, string[]>;
  const seedTxs: Record<string, string | null> = {};
  if (!args['skip-seed']) {
    log('Instancias de prueba:');
    // Stock vault through the factory (SC-02/SC-06), PoR attestation, mint.
    const vault = await ctx.soroban.invokeWithCosigners(
      factory,
      'deploy_stock_vault',
      {
        admin: deployer.publicKey(),
        wasm_hash: Buffer.from(hashes.stockVault, 'hex'),
        salt: randomBytes(32),
        custodian: deployer.publicKey(),
        por_oracle: porOracle.publicKey(),
        payment_kind: PAYMENT_KIND.USDC,
        terms: {
          ticker: 'FCDEMO',
          company_name: 'Fractachain Demo S.A.',
          isin: 'ARFCDEMO0001',
          custodian_cuit: '30700000000',
        },
        name: 'FCDEMO · Fractachain Demo S.A.',
      },
      deployer,
    );
    const vaultId = String(vault.result);
    if (!isContractId(vaultId)) throw new Error('deploy_stock_vault no devolvió un contrato');
    const vaultClient = await ctx.soroban.client(vaultId, deployer);
    const audit = createHash('sha256').update(`fcdemo-cdv-${vaultId}`).digest();
    const por = await ctx.soroban.invoke(
      vaultClient,
      'update_proof_of_reserve',
      { oracle: porOracle.publicKey(), shares_in_cv: 1_000n, audit_hash: audit },
      [porOracle],
    );
    const mint = await ctx.soroban.invoke(vaultClient, 'mint_backed_stock', {
      admin: deployer.publicKey(),
      to: issuer.publicKey(),
      amount: 400n,
      cv_deposit_hash: audit,
    });
    seeded.stockVaults.push(vaultId);
    Object.assign(seedTxs, { stockVault: vault.hash, proofOfReserve: por.hash, mint: mint.hash });
    log(`  stock vault ${vaultId} (PoR 1.000 acciones, 400 tokens emitidos)`, { tx: vault.hash });

    // Two USDC tenders: one open for a month, one short for the refund demo.
    const tender = async (label: string, soft: number, hard: number, deadline: number) => {
      const price = units(10, decimals);
      const deployed = await ctx.soroban.deployWithConstructor(hashes.licitacion, deployer, {
        admin: deployer.publicKey(),
        fiduciary: trustee.publicKey(),
        payment_token: usdcSac,
        soft_cap: units(soft, decimals),
        hard_cap: units(hard, decimals),
        deadline: BigInt(deadline),
        price_per_unit: price,
        legal_info: {
          fideicomiso_hash: createHash('sha256').update(`fideicomiso-${label}`).digest(),
          cnv_record_id: 'CNV-SANDBOX-INSTAWARD-1',
          legal_terms_uri:
            'https://github.com/Erosmart/fractachain/blob/macroupdate/docs/instaward-1/plan.md',
        },
      });
      const { result } = await ctx.soroban.invoke(factoryClient, 'register_product', {
        admin: deployer.publicKey(),
        kind: PRODUCT_KIND.Licitacion,
        contract_address: deployed.contractId,
        payment_kind: PAYMENT_KIND.USDC,
        price_per_unit: price,
        name: `Licitación demo USDC · ${label}`,
      });
      log(`  licitación ${label} ${deployed.contractId} (producto #${String(result)})`, {
        tx: deployed.hash,
      });
      seeded.tenders.push(deployed.contractId);
      seedTxs[`tender:${label}`] = deployed.hash;
      return deployed.contractId;
    };
    deployment.licitacion = await tender('abierta', 100, 1_000, nowSec() + 30 * 86_400);
    deployment.refundDemoTender = await tender('reembolso', 1_000, 1_000, nowSec() + refundMinutes * 60);
    deployment.stockVault = vaultId;

    // Forward and warrant through the factory, settled in USDC, with co-signers.
    const forward = await ctx.soroban.invokeWithCosigners(
      factory,
      'deploy_forward',
      {
        admin: deployer.publicKey(),
        wasm_hash: Buffer.from(hashes.forward, 'hex'),
        salt: randomBytes(32),
        producer: producer.publicKey(),
        buyer: buyer.publicKey(),
        arbiter: deployer.publicKey(),
        payment_kind: PAYMENT_KIND.USDC,
        terms: {
          crop_name: 'Soja',
          total_kilos: 10n,
          price_per_kilo: units(1, decimals),
          harvest_deadline: BigInt(nowSec() + 90 * 86_400),
        },
        name: 'Forward soja (demo USDC)',
      },
      deployer,
      [producer, buyer],
    );
    if (!isContractId(String(forward.result))) throw new Error('deploy_forward no devolvió un contrato');
    seeded.forwards.push(String(forward.result));
    deployment.forward = String(forward.result);
    seedTxs.forward = forward.hash;
    log(`  forward ${String(forward.result)} (10 kg × 1 USDC en escrow)`, { tx: forward.hash });

    await ctx.soroban.invoke(factoryClient, 'set_warrantera', {
      admin: deployer.publicKey(),
      who: warrantera.publicKey(),
      allowed: true,
    });
    const warrant = await ctx.soroban.invokeWithCosigners(
      factory,
      'deploy_warrant',
      {
        admin: deployer.publicKey(),
        wasm_hash: Buffer.from(hashes.warrant, 'hex'),
        salt: randomBytes(32),
        producer: producer.publicKey(),
        oracle_warrantera: warrantera.publicKey(),
        payment_kind: PAYMENT_KIND.USDC,
        terms: {
          pogr_cert_hash: createHash('sha256').update('pogr-demo').digest(),
          inventory_value: units(1_000, decimals),
          ltv_bps: 5000,
          interest_rate_bps: 1000,
          duration_days: 90n,
        },
        name: 'Warrant soja (demo USDC)',
      },
      deployer,
      [producer, warrantera],
    );
    if (!isContractId(String(warrant.result))) throw new Error('deploy_warrant no devolvió un contrato');
    seeded.warrants.push(String(warrant.result));
    deployment.warrant = String(warrant.result);
    seedTxs.warrant = warrant.hash;
    log(`  warrant ${String(warrant.result)} (préstamo 500 USDC sobre 1.000 de inventario)`, {
      tx: warrant.hash,
    });
  }
  deployment.seedTransactions = seedTxs;

  /* ---------------------------------------------------------------- output */
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, `${JSON.stringify(deployment, null, 2)}\n`);
  writeEnvFile(
    envOut,
    {
      ...env,
      STELLAR_NETWORK: network,
      STELLAR_HORIZON_URL: preset.horizonUrl,
      STELLAR_RPC_URL: preset.rpcUrl,
      STELLAR_FRIENDBOT_URL: preset.friendbotUrl,
      STELLAR_NETWORK_PASSPHRASE: preset.passphrase,
      STELLAR_EXPLORER_URL: preset.explorerUrl,
      STELLAR_DEPLOYMENT_FILE: out,
      STELLAR_USDC_CODE: usdcAsset.getCode(),
      STELLAR_USDC_ISSUER: usdcAsset.getIssuer() ?? '',
      USDC_MODE: usdcMode,
    },
    `stellar:deploy ${network} · ${new Date().toISOString()}`,
  );
  log(`\nListo. Deployment: ${out}\nSecretos (no commitear): ${envOut}`);
  log(
    `Para el API: ENV_FILE=${envOut} (o copiá las variables a tu .env). ` +
      (usdcMode === 'circle'
        ? 'Fondeá el pool con: npm run stellar:fund-pool -- --network testnet --usdc 2000'
        : 'El pool ya tiene 100.000 USDC del equipo.'),
  );
});
