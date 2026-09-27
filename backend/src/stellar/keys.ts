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
 * Issuer account the platform can actually sign for.
 *
 * Prefer the real STELLAR_ISSUER_SECRET. When it is not configured (a fresh
 * clone, or a Railway box without secrets), provisions a friendbot-funded
 * issuer persisted as STELLAR_PLATFORM_ISSUER_SECRET — same resilience
 * pattern as licitacionAdminKeypair. A token can only reach a holder's
 * wallet if the account that issued it can sign, so `issuerPublicKey` in a
 * dossier must point at whichever of these two secrets is active.
 */
export function platformIssuerPublicKey(): string | null {
  for (const name of ['STELLAR_ISSUER_SECRET', 'STELLAR_PLATFORM_ISSUER_SECRET']) {
    const secret = String(process.env[name] || '').trim();
    if (!secret.startsWith('S')) continue;
    try {
      return Keypair.fromSecret(secret).publicKey();
    } catch {
      // malformed secret — fall through to the next source
    }
  }
  return null;
}

/** Keypair that signs as the issuer of `asset`, or throws naming the fix. */
export function issuerKeypairFor(assetIssuer: string): Keypair {
  for (const name of ['STELLAR_ISSUER_SECRET', 'STELLAR_PLATFORM_ISSUER_SECRET']) {
    const secret = String(process.env[name] || '').trim();
    if (!secret.startsWith('S')) continue;
    try {
      const kp = Keypair.fromSecret(secret);
      if (kp.publicKey() === assetIssuer) return kp;
    } catch {
      // malformed secret — keep looking
    }
  }
  throw new Error(
    `La plataforma no tiene la clave del emisor ${assetIssuer}. ` +
      'Configurá STELLAR_ISSUER_SECRET con la S… de esa cuenta, o emití el listing con el emisor provisionado.',
  );
}

/**
 * Returns the issuer keypair, provisioning a friendbot-funded one and
 * persisting it in .env when no issuer secret is configured.
 */
export async function ensurePlatformIssuer(): Promise<Keypair> {
  const configured = String(process.env.STELLAR_ISSUER_SECRET || '').trim();
  if (configured.startsWith('S')) return Keypair.fromSecret(configured);
  const existing = String(process.env.STELLAR_PLATFORM_ISSUER_SECRET || '').trim();
  if (existing.startsWith('S')) return Keypair.fromSecret(existing);
  const kp = Keypair.random();
  for (let i = 0; i < 3; i++) {
    const faucet = await fundFriendbot(kp.publicKey());
    if (faucet.funded) {
      writeEnv('STELLAR_PLATFORM_ISSUER_SECRET', kp.secret());
      console.warn(
        `Sin STELLAR_ISSUER_SECRET: emisor de plataforma nuevo ${kp.publicKey()} (fondeado por Friendbot).`,
      );
      return kp;
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(`Friendbot no fondeó el emisor de plataforma ${kp.publicKey()}`);
}

/**
 * PoR oracle for per-listing stock vaults. Must differ from the vault admin
 * (the contract refuses a custodian auditing its own reserve), so it gets
 * its own provisioned key: STELLAR_POR_ORACLE_SECRET.
 */
export async function porOracleKeypair(): Promise<Keypair> {
  const existing = String(process.env.STELLAR_POR_ORACLE_SECRET || '').trim();
  if (existing.startsWith('S')) return Keypair.fromSecret(existing);
  const kp = Keypair.random();
  for (let i = 0; i < 3; i++) {
    const faucet = await fundFriendbot(kp.publicKey());
    if (faucet.funded) {
      writeEnv('STELLAR_POR_ORACLE_SECRET', kp.secret());
      console.warn(`Oráculo PoR provisionado: ${kp.publicKey()}`);
      return kp;
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(`Friendbot no fondeó el oráculo PoR ${kp.publicKey()}`);
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
