import fs from 'fs';
import path from 'path';
import { Asset, Keypair, StrKey } from '@stellar/stellar-sdk';
import { getTestnetConfig } from '../admin/testnet';
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
  for (const name of [
    'STELLAR_ISSUER_SECRET',
    'STELLAR_PLATFORM_ISSUER_SECRET',
    'STELLAR_USDC_ISSUER_SECRET',
    'STELLAR_DEPLOYER_SECRET',
  ]) {
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

/** Circle's USDC issuer on Stellar testnet (developers.circle.com). */
export const CIRCLE_TESTNET_USDC_ISSUER = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';

export function usdcCode(): string {
  return (
    loadTestnetDeployment()?.usdcClassic?.code ||
    String(process.env.STELLAR_USDC_CODE || '').trim() ||
    'USDC'
  );
}

let warnedIssuerOverride = false;

/**
 * Classic USDC the licitaciones settle in: Circle's on testnet, or a
 * platform-issued asset as the fallback (`npm run usdc:set`).
 *
 * deployments/testnet.json wins because the factory and every deployed
 * instance are bound to that asset's SAC; letting an env var drift from it is
 * how balance checks ended up reading one USDC while the contract pulled
 * another. STELLAR_USDC_ISSUER and the issuer secret only apply to a fresh
 * clone with no deployment recorded.
 */
export function usdcIssuerPublicKey(): string | null {
  const deployed = loadTestnetDeployment()?.usdcClassic?.issuer;
  const configured = String(process.env.STELLAR_USDC_ISSUER || '').trim();
  if (deployed && StrKey.isValidEd25519PublicKey(deployed)) {
    if (configured && configured !== deployed && !warnedIssuerOverride) {
      warnedIssuerOverride = true;
      console.warn(
        `STELLAR_USDC_ISSUER (${configured}) se ignora: deployments/testnet.json fija ${deployed}. Cambialo con npm run usdc:set.`,
      );
    }
    return deployed;
  }
  if (configured && StrKey.isValidEd25519PublicKey(configured)) return configured;
  const secret = String(process.env.STELLAR_USDC_ISSUER_SECRET || '').trim();
  if (secret.startsWith('S')) {
    try {
      return Keypair.fromSecret(secret).publicKey();
    } catch {
      // malformed — nothing configured
    }
  }
  return null;
}

export function usdcClassicAsset(): Asset {
  const issuer = usdcIssuerPublicKey();
  if (!issuer) {
    throw new Error('Falta el emisor USDC: corré npm run usdc:set -- circle');
  }
  return new Asset(usdcCode(), issuer);
}

/**
 * Contract ID of the USDC SAC, derived from the classic asset so it can never
 * point at a different token than the one balances are read against.
 */
export function usdcSacId(): string {
  return usdcClassicAsset().contractId(getTestnetConfig().networkPassphrase);
}

export function isCircleUsdc(): boolean {
  return usdcIssuerPublicKey() === CIRCLE_TESTNET_USDC_ISSUER;
}

/** The USDC issuer key when the platform holds it (own asset); null for Circle. */
export function usdcMintKeypair(): Keypair | null {
  const want = usdcIssuerPublicKey();
  if (!want) return null;
  for (const name of [
    'STELLAR_USDC_ISSUER_SECRET',
    'STELLAR_ISSUER_SECRET',
    'STELLAR_PLATFORM_ISSUER_SECRET',
    'STELLAR_DEPLOYER_SECRET',
    'STELLAR_LICITACION_ADMIN_SECRET',
  ]) {
    const secret = String(process.env[name] || '').trim();
    if (!secret.startsWith('S')) continue;
    try {
      const kp = Keypair.fromSecret(secret);
      if (kp.publicKey() === want) return kp;
    } catch {
      // malformed secret — keep looking
    }
  }
  return null;
}

/**
 * Demo USDC pool. Circle's USDC cannot be minted by the platform, so grants
 * are transfers out of this wallet, topped up from faucet.circle.com.
 */
export function usdcTreasuryKeypair(): Keypair | null {
  const secret = String(process.env.STELLAR_USDC_TREASURY_SECRET || '').trim();
  if (!secret.startsWith('S')) return null;
  try {
    return Keypair.fromSecret(secret);
  } catch {
    return null;
  }
}

/** Same as `usdcTreasuryKeypair`, provisioning a friendbot-funded pool when missing. */
export async function ensureUsdcTreasuryKeypair(): Promise<Keypair> {
  const existing = usdcTreasuryKeypair();
  if (existing) return existing;
  const kp = Keypair.random();
  for (let i = 0; i < 3; i++) {
    const faucet = await fundFriendbot(kp.publicKey());
    if (faucet.funded) {
      writeEnv('STELLAR_USDC_TREASURY_SECRET', kp.secret());
      console.warn(`Tesorería USDC de demo provisionada: ${kp.publicKey()}`);
      return kp;
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(`Friendbot no fondeó la tesorería USDC ${kp.publicKey()}`);
}

/**
 * Signing side of `usdcIssuerPublicKey`. Provisions a friendbot-funded issuer
 * and persists it when nothing is configured — same pattern as
 * `ensurePlatformIssuer`, so a fresh clone still gets a working faucet.
 */
export async function usdcIssuerKeypair(): Promise<Keypair> {
  const want = usdcIssuerPublicKey();
  const held = usdcMintKeypair();
  if (held) return held;
  if (want) {
    throw new Error(
      `La plataforma no tiene la clave del emisor USDC ${want}. Configurá STELLAR_USDC_ISSUER_SECRET con la S… de esa cuenta.`,
    );
  }
  const kp = Keypair.random();
  for (let i = 0; i < 3; i++) {
    const faucet = await fundFriendbot(kp.publicKey());
    if (faucet.funded) {
      writeEnv('STELLAR_USDC_ISSUER_SECRET', kp.secret());
      writeEnv('STELLAR_USDC_ISSUER', kp.publicKey());
      console.warn(`Emisor USDC de testnet provisionado: ${kp.publicKey()}`);
      return kp;
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(`Friendbot no fondeó el emisor USDC ${kp.publicKey()}`);
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
