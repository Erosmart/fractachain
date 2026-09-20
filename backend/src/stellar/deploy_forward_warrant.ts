/**
 * Instantiate forward + warrant from the WASM hashes already on testnet.
 * Needs STELLAR_DEPLOYER_SECRET (factory admin for set_warrantera).
 *
 *   cd backend && npx ts-node src/stellar/deploy_forward_warrant.ts
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { Keypair } from '@stellar/stellar-sdk';
import { createStellarKeypair, fundFriendbot } from '../auth/stellar_testnet';
import { loadTestnetDeployment, saveTestnetDeployment } from './deployment';
import { hasDeployerSecret, licitacionAdminKeypair } from './keys';
import {
  STROOPS_PER_UNIT,
  contractClient,
  deployFromWasmHash,
  factoryId,
  invoke,
  wasmHashOf,
  xlmSac,
} from './soroban';

const ACTORS = path.join(__dirname, '..', '..', '..', 'deployments', 'testnet-actors.local.json');

async function fundedKey(label: string) {
  const keys = createStellarKeypair();
  const faucet = await fundFriendbot(keys.publicKey);
  if (!faucet.funded) {
    throw new Error(`Friendbot no fondeó ${label} ${keys.publicKey}`);
  }
  return { label, ...keys, kp: Keypair.fromSecret(keys.secretKey) };
}

async function main() {
  const deployment = loadTestnetDeployment();
  if (!deployment?.forwardWasmHash || !deployment?.warrantWasmHash) {
    throw new Error('Faltan forwardWasmHash / warrantWasmHash en deployments/testnet.json');
  }
  const admin = await licitacionAdminKeypair();
  const producer = await fundedKey('producer');
  const buyer = await fundedKey('buyer');
  const warrantera = await fundedKey('warrantera');

  let registry = factoryId();
  if (hasDeployerSecret()) {
    const factory = await contractClient(registry, admin);
    await invoke(factory, 'set_warrantera', {
      admin: admin.publicKey(),
      who: warrantera.publicKey,
      allowed: true,
    });
    console.log('warrantera accredited on existing factory', warrantera.publicKey);
  } else {
    const factoryWasm = await wasmHashOf(registry);
    const cloned = await deployFromWasmHash(factoryWasm, admin);
    const factory = await contractClient(cloned.contractId, admin);
    await invoke(factory, 'initialize', { admin: admin.publicKey() });
    await invoke(factory, 'set_payment_asset', {
      admin: admin.publicKey(),
      kind: 0,
      token: xlmSac(),
    });
    await invoke(factory, 'set_warrantera', {
      admin: admin.publicKey(),
      who: warrantera.publicKey,
      allowed: true,
    });
    registry = cloned.contractId;
    console.log('cloned factory for warrant', registry);
  }

  const harvest = BigInt(Math.floor(Date.now() / 1000) + 90 * 86400);
  const kilos = 10n;
  const pricePerKilo = STROOPS_PER_UNIT; // 1 XLM
  const forward = await deployFromWasmHash(deployment.forwardWasmHash, admin);
  console.log('forward instance', forward.contractId, forward.hash || '');
  try {
    const forwardClient = await contractClient(forward.contractId, buyer.kp);
    await invoke(
      forwardClient,
      'initialize',
      {
        registry,
        producer: producer.publicKey,
        buyer: buyer.publicKey,
        arbiter: admin.publicKey(),
        payment_token: xlmSac(),
        crop_name: 'Soja',
        total_kilos: kilos,
        price_per_kilo: pricePerKilo,
        harvest_deadline: harvest,
      },
      [producer.kp],
    );
    console.log('forward initialized');
  } catch (err: any) {
    console.warn('forward initialize skipped:', err?.message || err);
  }

  const warrant = await deployFromWasmHash(deployment.warrantWasmHash, admin);
  console.log('warrant instance', warrant.contractId, warrant.hash || '');
  try {
    const warrantClient = await contractClient(warrant.contractId, producer.kp);
    await invoke(
      warrantClient,
      'initialize',
      {
        registry,
        producer: producer.publicKey,
        oracle_warrantera: warrantera.publicKey,
        payment_token: xlmSac(),
        pogr_cert_hash: Buffer.alloc(32, 2),
        inventory_value: 1_000n * STROOPS_PER_UNIT,
        ltv_bps: 5000,
        interest_rate_bps: 1000,
        duration_days: 90n,
      },
      [warrantera.kp],
    );
    console.log('warrant initialized');
  } catch (err: any) {
    console.warn('warrant initialize skipped:', err?.message || err);
  }

  fs.writeFileSync(
    ACTORS,
    JSON.stringify(
      {
        producer: { publicKey: producer.publicKey, secretKey: producer.secretKey },
        buyer: { publicKey: buyer.publicKey, secretKey: buyer.secretKey },
        warrantera: { publicKey: warrantera.publicKey, secretKey: warrantera.secretKey },
      },
      null,
      2,
    ) + '\n',
  );
  saveTestnetDeployment({
    forward: forward.contractId,
    warrant: warrant.contractId,
    warrantFactory: registry,
  });
  console.log('actors (secrets) →', ACTORS);
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});
