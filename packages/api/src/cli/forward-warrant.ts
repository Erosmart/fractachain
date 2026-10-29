import fs from 'fs';
import path from 'path';
import { Keypair } from '@stellar/stellar-sdk';
import { STROOPS_PER_UNIT } from '../domain/stellar/StellarAddress';
import type { SorobanGateway } from '../infrastructure/stellar/SorobanGateway';

export interface Actor {
  publicKey: string;
  secretKey: string;
  kp: Keypair;
}

/** Testnet actors file (secrets — gitignored via deployments/*.local.json). */
export function actorsFile(deploymentFile: string): string {
  return path.join(path.dirname(deploymentFile), 'testnet-actors.local.json');
}

export function readActor(file: string, label: string): Actor {
  const row = JSON.parse(fs.readFileSync(file, 'utf8'))[label];
  if (!row?.secretKey) throw new Error(`Falta actor ${label} en ${file}`);
  return { publicKey: row.publicKey, secretKey: row.secretKey, kp: Keypair.fromSecret(row.secretKey) };
}

export async function initializeForward(soroban: SorobanGateway, contractId: string, a: { registry: string; producer: Actor; buyer: Actor; arbiter: string }) {
  const client = await soroban.client(contractId, a.buyer.kp);
  return soroban.invoke(
    client,
    'initialize',
    {
      registry: a.registry,
      producer: a.producer.publicKey,
      buyer: a.buyer.publicKey,
      arbiter: a.arbiter,
      payment_token: soroban.xlmSac(),
      crop_name: 'Soja',
      total_kilos: 10n,
      price_per_kilo: STROOPS_PER_UNIT,
      harvest_deadline: BigInt(Math.floor(Date.now() / 1000) + 90 * 86400),
    },
    [a.producer.kp],
  );
}

export async function initializeWarrant(soroban: SorobanGateway, contractId: string, a: { registry: string; producer: Actor; warrantera: Actor }) {
  const client = await soroban.client(contractId, a.producer.kp);
  return soroban.invoke(
    client,
    'initialize',
    {
      registry: a.registry,
      producer: a.producer.publicKey,
      oracle_warrantera: a.warrantera.publicKey,
      payment_token: soroban.xlmSac(),
      pogr_cert_hash: Buffer.alloc(32, 2),
      inventory_value: 1_000n * STROOPS_PER_UNIT,
      ltv_bps: 5000,
      interest_rate_bps: 1000,
      duration_days: 90n,
    },
    [a.warrantera.kp],
  );
}

/** Reads back `get_registry` (SC-02) when the WASM exposes it; throws on mismatch. */
export async function verifyRegistry(soroban: SorobanGateway, contractId: string, expected: string): Promise<void> {
  const client = await soroban.client(contractId);
  const registry = await soroban.readOptional<string>(client, 'get_registry');
  if (registry !== undefined && String(registry) !== expected) {
    throw new Error(`${contractId} apunta al registry ${registry}, se esperaba ${expected}`);
  }
}
