import { randomBytes } from 'crypto';
import fs from 'fs';
import path from 'path';
import { Keypair } from '@stellar/stellar-sdk';
import { isContractId } from '../domain/stellar/StellarAddress';
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

const PAYMENT_KIND_XLM = 0;

/** Demo terms shared by both deploy paths. */
const forwardTerms = () => ({
  crop_name: 'Soja',
  total_kilos: 10n,
  price_per_kilo: STROOPS_PER_UNIT,
  harvest_deadline: BigInt(Math.floor(Date.now() / 1000) + 90 * 86400),
});

const warrantTerms = () => ({
  pogr_cert_hash: Buffer.alloc(32, 2),
  inventory_value: 1_000n * STROOPS_PER_UNIT,
  ltv_bps: 5000,
  interest_rate_bps: 1000,
  duration_days: 90n,
});

async function factoryDeploy(
  soroban: SorobanGateway,
  factory: string,
  method: 'deploy_forward' | 'deploy_warrant',
  admin: Keypair,
  args: Record<string, unknown>,
  cosigners: Keypair[],
): Promise<{ contractId: string; hash: string | null }> {
  const { hash, result } = await soroban.invokeWithCosigners(
    factory,
    method,
    { admin: admin.publicKey(), salt: randomBytes(32), payment_kind: PAYMENT_KIND_XLM, ...args },
    admin,
    cosigners,
  );
  if (!isContractId(String(result))) throw new Error(`${method} no devolvió un contrato`);
  return { contractId: String(result), hash };
}

/**
 * Factory deploy (constructor WASM): the factory vets the terms and signs off
 * the constructor, binding the forward to it (SC-02) atomically (SC-06).
 * Producer and buyer authorize the constructor (it escrows the buyer's XLM).
 */
export function deployForwardViaFactory(
  soroban: SorobanGateway,
  factory: string,
  wasmHash: string,
  a: { admin: Keypair; producer: Actor; buyer: Actor; arbiter: string },
) {
  return factoryDeploy(
    soroban,
    factory,
    'deploy_forward',
    a.admin,
    {
      wasm_hash: Buffer.from(wasmHash, 'hex'),
      producer: a.producer.publicKey,
      buyer: a.buyer.publicKey,
      arbiter: a.arbiter,
      terms: forwardTerms(),
      name: 'Forward soja (demo)',
    },
    [a.producer.kp, a.buyer.kp],
  );
}

/** Factory deploy of a warrant; the warrantera must be accredited first. */
export function deployWarrantViaFactory(
  soroban: SorobanGateway,
  factory: string,
  wasmHash: string,
  a: { admin: Keypair; producer: Actor; warrantera: Actor },
) {
  return factoryDeploy(
    soroban,
    factory,
    'deploy_warrant',
    a.admin,
    {
      wasm_hash: Buffer.from(wasmHash, 'hex'),
      producer: a.producer.publicKey,
      oracle_warrantera: a.warrantera.publicKey,
      terms: warrantTerms(),
      name: 'Warrant soja (demo)',
    },
    [a.producer.kp, a.warrantera.kp],
  );
}

/** Legacy WASM: `initialize` on an already deployed instance. */
export async function initializeForward(
  soroban: SorobanGateway,
  contractId: string,
  a: { registry: string; producer: Actor; buyer: Actor; arbiter: string },
) {
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
      ...forwardTerms(),
    },
    [a.producer.kp],
  );
}

/** Legacy WASM: `initialize` on an already deployed instance. */
export async function initializeWarrant(
  soroban: SorobanGateway,
  contractId: string,
  a: { registry: string; producer: Actor; warrantera: Actor },
) {
  const client = await soroban.client(contractId, a.producer.kp);
  return soroban.invoke(
    client,
    'initialize',
    {
      registry: a.registry,
      producer: a.producer.publicKey,
      oracle_warrantera: a.warrantera.publicKey,
      payment_token: soroban.xlmSac(),
      ...warrantTerms(),
    },
    [a.warrantera.kp],
  );
}

/** Reads back `get_registry` (SC-02) when the WASM exposes it; throws on mismatch. */
export async function verifyRegistry(
  soroban: SorobanGateway,
  contractId: string,
  expected: string,
): Promise<void> {
  const client = await soroban.client(contractId);
  const registry = await soroban.readOptional<string>(client, 'get_registry');
  if (registry !== undefined && String(registry) !== expected) {
    throw new Error(`${contractId} apunta al registry ${registry}, se esperaba ${expected}`);
  }
}
