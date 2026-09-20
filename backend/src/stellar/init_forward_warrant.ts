/**
 * Initialize already-deployed forward/warrant instances (dual-auth).
 * Uses deployments/testnet.json + testnet-actors.local.json.
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { Keypair } from '@stellar/stellar-sdk';
import { loadTestnetDeployment } from './deployment';
import { licitacionAdminKeypair } from './keys';
import {
  STROOPS_PER_UNIT,
  contractClient,
  invoke,
  isLiveContractId,
  xlmSac,
} from './soroban';

const ACTORS = path.join(__dirname, '..', '..', '..', 'deployments', 'testnet-actors.local.json');

function actor(label: string) {
  const data = JSON.parse(fs.readFileSync(ACTORS, 'utf8'));
  const row = data[label];
  if (!row?.secretKey) throw new Error(`Falta actor ${label} en ${ACTORS}`);
  return { ...row, kp: Keypair.fromSecret(row.secretKey) };
}

async function main() {
  const deployment = loadTestnetDeployment();
  if (!isLiveContractId(deployment?.forward) || !isLiveContractId(deployment?.warrant)) {
    throw new Error('Faltan forward/warrant en deployments/testnet.json');
  }
  const registry = deployment?.warrantFactory || deployment?.factory;
  if (!isLiveContractId(registry)) throw new Error('Falta factory para initialize');
  const admin = await licitacionAdminKeypair();
  const producer = actor('producer');
  const buyer = actor('buyer');
  const warrantera = actor('warrantera');
  const harvest = BigInt(Math.floor(Date.now() / 1000) + 90 * 86400);

  try {
    const forwardClient = await contractClient(deployment!.forward!, buyer.kp);
    const sent = await invoke(
      forwardClient,
      'initialize',
      {
        registry,
        producer: producer.publicKey,
        buyer: buyer.publicKey,
        arbiter: admin.publicKey(),
        payment_token: xlmSac(),
        crop_name: 'Soja',
        total_kilos: 10n,
        price_per_kilo: STROOPS_PER_UNIT,
        harvest_deadline: harvest,
      },
      [producer.kp],
    );
    console.log('forward initialized', sent.hash);
  } catch (err: any) {
    console.warn('forward initialize skipped:', err?.message || err);
  }

  try {
    const warrantClient = await contractClient(deployment!.warrant!, producer.kp);
    const sent = await invoke(
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
    console.log('warrant initialized', sent.hash);
  } catch (err: any) {
    console.warn('warrant initialize skipped:', err?.message || err);
  }
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});
