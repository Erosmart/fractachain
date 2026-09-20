import fs from 'fs';
import path from 'path';
import { Keypair } from '@stellar/stellar-sdk';
import { fundFriendbot } from '../auth/stellar_testnet';
import { loadTestnetDeployment } from './deployment';

const ENV_FILE = path.join(__dirname, '..', '..', '.env');

function requireSecret(name: string): string {
  const value = String(process.env[name] || '').trim();
  if (!value.startsWith('S')) {
    throw new Error(
      `Falta ${name} en backend/.env. Pegá la S… de fc-deployer / fc-issuer (la misma que usó Eros el 18/09). No la subas a git.`,
    );
  }
  return value;
}

function writeEnv(key: string, value: string) {
  let text = '';
  try {
    text = fs.readFileSync(ENV_FILE, 'utf8');
  } catch {
    text = '';
  }
  const lines = text.split(/\r?\n/);
  let found = false;
  const next = lines.map((line) => {
    if (line.startsWith(`${key}=`)) {
      found = true;
      return `${key}=${value}`;
    }
    return line;
  });
  if (!found) next.push(`${key}=${value}`);
  fs.writeFileSync(ENV_FILE, next.filter((l, i, a) => l || i < a.length - 1).join('\n').replace(/\n*$/, '\n'));
  process.env[key] = value;
}

export function deployerKeypair(): Keypair {
  const kp = Keypair.fromSecret(requireSecret('STELLAR_DEPLOYER_SECRET'));
  const expected = loadTestnetDeployment()?.deployer;
  if (expected && kp.publicKey() !== expected) {
    throw new Error(
      `STELLAR_DEPLOYER_SECRET no corresponde a ${expected} (dio ${kp.publicKey()}).`,
    );
  }
  return kp;
}

export function issuerKeypair(): Keypair {
  const kp = Keypair.fromSecret(requireSecret('STELLAR_ISSUER_SECRET'));
  const expected = loadTestnetDeployment()?.issuer;
  if (expected && kp.publicKey() !== expected) {
    throw new Error(
      `STELLAR_ISSUER_SECRET no corresponde a ${expected} (dio ${kp.publicKey()}).`,
    );
  }
  return kp;
}

export function hasDeployerSecret(): boolean {
  try {
    deployerKeypair();
    return true;
  } catch {
    return false;
  }
}

/**
 * Admin that may call verify_investor / initialize on the Las Lilas instance.
 * Prefers fc-deployer; if those S… still aren't in .env, uses (or creates)
 * STELLAR_LICITACION_ADMIN_SECRET so the demo loop can ship on this machine.
 */
export async function licitacionAdminKeypair(): Promise<Keypair> {
  if (hasDeployerSecret()) return deployerKeypair();
  const existing = String(process.env.STELLAR_LICITACION_ADMIN_SECRET || '').trim();
  if (existing.startsWith('S')) return Keypair.fromSecret(existing);
  const kp = Keypair.random();
  for (let i = 0; i < 3; i++) {
    const faucet = await fundFriendbot(kp.publicKey());
    if (faucet.funded) {
      writeEnv('STELLAR_LICITACION_ADMIN_SECRET', kp.secret());
      console.warn(
        `Sin STELLAR_DEPLOYER_SECRET: admin de licitación nuevo ${kp.publicKey()}. La factory de Eros no se toca.`,
      );
      return kp;
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(`Friendbot no fondeó el admin de licitación ${kp.publicKey()}`);
}
