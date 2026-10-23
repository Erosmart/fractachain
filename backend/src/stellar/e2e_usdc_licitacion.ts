/**
 * End-to-end check of a licitación settled in the configured USDC (Circle's
 * on testnet), producing the Stellar Expert evidence Instaward 1 asks for.
 *
 *   npm run e2e:usdc
 *
 * Flow, sized for a pool fed 20 USDC at a time:
 *   A (succeeds): hard cap 3 → investor contributes 3 → finalize pays the fiduciary.
 *   B (fails):    soft cap 10, short deadline → investor contributes 2 →
 *                 finalize leaves it Failed → refund returns the 2.
 * Throwaway investor/fiduciary wallets are created for the run and their USDC
 * is swept back to the treasury at the end.
 */
import 'dotenv/config';
import { createHash } from 'crypto';
import { Horizon, Keypair, Operation, TransactionBuilder } from '@stellar/stellar-sdk';
import { getTestnetConfig } from '../admin/testnet';
import { fundFriendbot, loadAssetBalance } from '../auth/stellar_testnet';
import { loadTestnetDeployment } from './deployment';
import { licitacionAdminKeypair, usdcClassicAsset, usdcSacId, usdcTreasuryKeypair } from './keys';
import { explorerTx } from './onchain';
import { contractClient, deployFromWasmHash, factoryId, invoke, read, toStroops } from './soroban';
import { parseLicitacionState, licitacionStateName } from './licitacion_state';
import { ensureFiduciaryUsdcTrustline, fundTestnetUsdc } from './usdc';

const ARGENTINA = 32;
const INVESTOR_NATIONAL = 0;
const KIND_LICITACION = 0;
const PAYMENT_USDC = 1;
const PRICE = 1;
const INVESTOR_GRANT = 8;
const B_DEADLINE_SECS = 150;

const evidence: { step: string; hash: string | null }[] = [];

function log(step: string, hash: string | null) {
  evidence.push({ step, hash });
  console.log(`✓ ${step}${hash ? `  ${explorerTx(hash)}` : ''}`);
}

async function usdc(account: string) {
  const asset = usdcClassicAsset();
  return loadAssetBalance(account, asset.code, asset.issuer!);
}

async function deployLicitacion(
  label: string,
  admin: Keypair,
  fiduciary: string,
  caps: { soft: number; hard: number },
  deadline: number,
) {
  const wasmHash = loadTestnetDeployment()?.licitacionWasmHash;
  if (!wasmHash) throw new Error('deployments/testnet.json no tiene licitacionWasmHash');
  const deployed = await deployFromWasmHash(wasmHash, admin);
  log(`${label}: deploy ${deployed.contractId}`, deployed.hash);
  const client = await contractClient(deployed.contractId, admin);
  const init = await invoke(client, 'initialize', {
    admin: admin.publicKey(),
    fiduciary,
    payment_token: usdcSacId(),
    soft_cap: toStroops(caps.soft),
    hard_cap: toStroops(caps.hard),
    deadline: BigInt(deadline),
    price_per_unit: toStroops(PRICE),
    legal_info: {
      fideicomiso_hash: createHash('sha256').update(`e2e-usdc-${label}-${deadline}`).digest(),
      cnv_record_id: 'E2E-USDC',
      legal_terms_uri: 'https://github.com/Erosmart/fractachain',
    },
  });
  log(`${label}: initialize (payment_token = SAC USDC Circle)`, init.hash);

  const factory = await contractClient(factoryId(), admin);
  const reg = await invoke(factory, 'register_product', {
    admin: admin.publicKey(),
    kind: KIND_LICITACION,
    contract_address: deployed.contractId,
    payment_kind: PAYMENT_USDC,
    price_per_unit: toStroops(PRICE),
    name: `E2E USDC ${label}`,
  });
  const productId = Number(reg.result);
  const current = await read<boolean>(factory, 'product_token_is_current', { product_id: BigInt(productId) });
  log(`${label}: factory.register_product #${productId} (token vigente: ${current})`, reg.hash);
  return { id: deployed.contractId, client };
}

async function state(client: Awaited<ReturnType<typeof contractClient>>) {
  return licitacionStateName(parseLicitacionState(await read(client, 'get_state')));
}

async function sweepToTreasury(wallet: Keypair, treasury: string) {
  const balance = await usdc(wallet.publicKey());
  if (balance <= 0) return null;
  const horizon = new Horizon.Server(getTestnetConfig().horizonUrl);
  const account = await horizon.loadAccount(wallet.publicKey());
  const tx = new TransactionBuilder(account, { fee: '10000', networkPassphrase: getTestnetConfig().networkPassphrase })
    .addOperation(Operation.payment({ destination: treasury, asset: usdcClassicAsset(), amount: balance.toFixed(7) }))
    .setTimeout(60)
    .build();
  tx.sign(wallet);
  const res = await horizon.submitTransaction(tx);
  return { hash: (res as any).hash as string, amount: balance };
}

async function main() {
  const treasury = usdcTreasuryKeypair();
  if (!treasury) throw new Error('Falta STELLAR_USDC_TREASURY_SECRET (npm run usdc:set -- circle)');
  const admin = await licitacionAdminKeypair();
  const asset = usdcClassicAsset();
  console.log(`USDC ${asset.code}:${asset.issuer}  SAC ${usdcSacId()}`);
  console.log(`Tesorería ${treasury.publicKey()}: ${await usdc(treasury.publicKey())} USDC\n`);

  const investor = Keypair.random();
  const fiduciary = Keypair.random();
  await Promise.all([fundFriendbot(investor.publicKey()), fundFriendbot(fiduciary.publicKey())]);
  console.log(`Inversor ${investor.publicKey()}\nFiduciario ${fiduciary.publicKey()}\n`);

  const grant = await fundTestnetUsdc(investor.publicKey(), {
    walletSecret: investor.secret(),
    grant: INVESTOR_GRANT,
  });
  log(`Inversor: trustline + ${INVESTOR_GRANT} USDC desde la tesorería (${grant.source})`, grant.hash);
  if (!(await ensureFiduciaryUsdcTrustline(fiduciary.publicKey(), fiduciary.secret()))) {
    throw new Error('No se pudo abrir la trustline USDC del fiduciario');
  }
  log('Fiduciario: trustline USDC', null);

  const expiry = BigInt(Math.floor(Date.now() / 1000) + 365 * 86400);
  const kyc = (client: Awaited<ReturnType<typeof contractClient>>) =>
    invoke(client, 'verify_investor', {
      admin: admin.publicKey(),
      investor: investor.publicKey(),
      country_code: ARGENTINA,
      investor_type: INVESTOR_NATIONAL,
      expiry,
    });

  // --- A: reaches the hard cap and pays the fiduciary ---
  console.log('\n— Licitación A (éxito)');
  const a = await deployLicitacion('A', admin, fiduciary.publicKey(), { soft: 1, hard: 3 }, Math.floor(Date.now() / 1000) + 3600);
  log('A: verify_investor', (await kyc(a.client)).hash);
  const aInvestor = await contractClient(a.id, investor);
  log('A: contribute 3 USDC (firma el inversor)', (await invoke(aInvestor, 'contribute', {
    buyer: investor.publicKey(),
    payment_amount: toStroops(3),
  })).hash);
  log('A: finalize → paga al fiduciario', (await invoke(a.client, 'finalize')).hash);
  console.log(`  estado ${await state(a.client)} · fiduciario ${await usdc(fiduciary.publicKey())} USDC`);

  // --- B: misses the soft cap, then refunds ---
  console.log('\n— Licitación B (fracasa + refund)');
  const bDeadline = Math.floor(Date.now() / 1000) + B_DEADLINE_SECS;
  const b = await deployLicitacion('B', admin, fiduciary.publicKey(), { soft: 10, hard: 10 }, bDeadline);
  log('B: verify_investor', (await kyc(b.client)).hash);
  const bInvestor = await contractClient(b.id, investor);
  log('B: contribute 2 USDC (firma el inversor)', (await invoke(bInvestor, 'contribute', {
    buyer: investor.publicKey(),
    payment_amount: toStroops(2),
  })).hash);
  console.log(`  inversor ${await usdc(investor.publicKey())} USDC antes del refund`);
  const waitMs = (bDeadline + 15) * 1000 - Date.now();
  if (waitMs > 0) {
    console.log(`  esperando ${Math.ceil(waitMs / 1000)}s a que venza el deadline…`);
    await new Promise((r) => setTimeout(r, waitMs));
  }
  log('B: finalize → Failed (no llegó al soft cap)', (await invoke(b.client, 'finalize')).hash);
  console.log(`  estado ${await state(b.client)}`);
  log('B: refund 2 USDC (firma el inversor)', (await invoke(bInvestor, 'refund', {
    contributor: investor.publicKey(),
  })).hash);
  console.log(`  inversor ${await usdc(investor.publicKey())} USDC después del refund`);

  // --- give the pool back ---
  console.log('\n— Devolución a la tesorería');
  for (const [name, kp] of [['inversor', investor], ['fiduciario', fiduciary]] as const) {
    const swept = await sweepToTreasury(kp, treasury.publicKey());
    if (swept) log(`${name}: devuelve ${swept.amount} USDC a la tesorería`, swept.hash);
  }
  console.log(`Tesorería: ${await usdc(treasury.publicKey())} USDC`);

  console.log('\nEvidencia:');
  for (const e of evidence.filter((x) => x.hash)) console.log(`- ${e.step}: ${explorerTx(e.hash!)}`);
  console.log(`- Licitación A: https://stellar.expert/explorer/testnet/contract/${a.id}`);
  console.log(`- Licitación B: https://stellar.expert/explorer/testnet/contract/${b.id}`);
}

main().catch((err) => {
  console.error('\n✗', err?.message || err);
  process.exit(1);
});
