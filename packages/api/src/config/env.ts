import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { z } from 'zod';

/**
 * Typed, validated configuration — the only place that reads `process.env`
 * for settings (Stellar secrets are the exception: see `ISecretStore`, since
 * the platform can provision those at runtime).
 *
 * Production refuses to boot with missing or example secrets instead of
 * silently falling back to a value that is public in this repository.
 */

/** packages/api — works from both `src/config` (tsx) and `dist/config` (node). */
export const API_ROOT = path.resolve(__dirname, '..', '..');
/** Repository root: home of the single `.env` shared by the web and the API. */
export const REPO_ROOT = path.resolve(API_ROOT, '..', '..');

const bool = z
  .string()
  .optional()
  .transform((v) => (v === undefined ? undefined : ['1', 'true', 'yes', 'on'].includes(v.trim().toLowerCase())));

const csv = z
  .string()
  .optional()
  .transform((v) =>
    (v ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).optional(),
  TRUST_PROXY: z.string().optional(),
  CORS_ORIGINS: csv,

  DATA_DIR: z.string().optional(),
  DATABASE_URL: z.string().optional(),
  ENV_FILE: z.string().optional(),

  AUTH_SECRET: z.string().optional(),
  /** Legacy name for AUTH_SECRET (v1 deployments). */
  AUTH_PEPPER: z.string().optional(),
  WALLET_PEPPER: z.string().optional(),
  /** Previous WALLET_PEPPER, kept only to decrypt-and-reseal during a key rotation. */
  WALLET_PEPPER_PREVIOUS: z.string().optional(),
  SESSION_TTL_HOURS: z.coerce.number().positive().max(24 * 30).default(12),

  ADMIN_EMAILS: csv,
  ADMIN_BOOTSTRAP_PASSWORD: z.string().optional(),
  DEMO_SEED_ACCOUNTS: bool,
  HACKATHON_DEMO: bool,
  KYC_AUTO_APPROVE: bool,
  KYC_ENFORCE_HOURS: bool,

  FIREBASE_PROJECT_ID: z.string().optional(),
  ADMIN_REQUIRE_2FA: bool,
  REQUIRE_EMAIL_VERIFICATION: bool,

  /** Public URL of the app, used in links sent by email. */
  APP_URL: z.string().url().optional(),
  /** smtp(s)://user:pass@host:port — without it emails are written to the log (development). */
  SMTP_URL: z.string().optional(),
  MAIL_FROM: z.string().default('Fractachain <no-reply@fractachain.local>'),

  STELLAR_NETWORK: z.string().default('testnet'),
  STELLAR_HORIZON_URL: z.string().url().default('https://horizon-testnet.stellar.org'),
  STELLAR_RPC_URL: z.string().url().default('https://soroban-testnet.stellar.org'),
  STELLAR_FRIENDBOT_URL: z.string().url().default('https://friendbot.stellar.org'),
  STELLAR_NETWORK_PASSPHRASE: z.string().default('Test SDF Network ; September 2015'),
  STELLAR_DEPLOYMENT_FILE: z.string().optional(),
  STELLAR_EXPLORER_URL: z.string().url().default('https://stellar.expert/explorer/testnet'),
  STELLAR_XLM_FLOOR: z.coerce.number().min(0).default(5),
  STELLAR_XLM_TOPUP: z.coerce.number().min(0).default(50),
  STELLAR_USDC_GRANT: z.coerce.number().min(1).default(10_000),
  STELLAR_USDC_CODE: z.string().min(1).max(12).default('USDC'),

  SETTLEMENT_SWEEP_MS: z.coerce.number().int().min(0).default(60_000),
});

export type RawEnv = z.infer<typeof EnvSchema>;

export interface AppConfig {
  env: 'development' | 'production' | 'test';
  isProduction: boolean;
  http: {
    port: number;
    host: string;
    trustProxy: boolean | number | string;
    corsOrigins: string[];
    /** Dev only: also accept localhost / private-LAN origins (phone testing on 192.168.x.x). */
    allowPrivateNetworkOrigins: boolean;
  };
  log: { level: string };
  storage: { dataDir: string; databaseUrl?: string; envFile: string };
  auth: {
    tokenSecret: string;
    sessionTtlMs: number;
    walletPepper: string;
    walletPepperPrevious?: string;
    adminEmails: string[];
    adminBootstrapPassword?: string;
    firebaseProjectId?: string;
    /** Admin routes refuse accounts without TOTP. */
    adminRequire2fa: boolean;
    /** KYC requires a confirmed email for email/password accounts. */
    requireEmailVerification: boolean;
    cookie: { name: string; secure: boolean };
  };
  mail: { appUrl: string; smtpUrl?: string; from: string };
  demo: {
    hackathon: boolean;
    seedAccounts: boolean;
    kycAutoApprove: boolean;
    kycEnforceHours: boolean;
  };
  stellar: {
    network: string;
    horizonUrl: string;
    rpcUrl: string;
    friendbotUrl: string;
    networkPassphrase: string;
    explorerUrl: string;
    deploymentFile: string;
    xlmFloor: number;
    xlmTopUp: number;
    usdcGrant: number;
    usdcCode: string;
    isTestnet: boolean;
  };
  jobs: { settlementSweepMs: number };
}

/** Values shipped in `.env.example` / docs — never acceptable in production. */
const PUBLIC_EXAMPLE_SECRETS = new Set([
  'cambiá-esto-antes-de-compartir-el-host',
  'cambiá-esto-también',
  'fractachain-dev-auth',
  'fractachain-dev-wallet',
  'change-me',
  'changeme',
]);

/** v1 default — kept in development so existing local `users.json` still decrypts. */
const LEGACY_DEV_WALLET_PEPPER = 'fractachain-dev-wallet';

export class ConfigError extends Error {}

function resolveDeploymentFile(explicit?: string): string {
  if (explicit) return path.resolve(explicit);
  const candidates = [
    path.join(process.cwd(), 'deployments', 'testnet.json'),
    path.join(API_ROOT, '..', '..', 'deployments', 'testnet.json'),
    path.join(API_ROOT, 'deployments', 'testnet.json'),
  ];
  return candidates.find((file) => fs.existsSync(file)) ?? candidates[1];
}

function parseTrustProxy(raw: string | undefined, isProduction: boolean): boolean | number | string {
  if (raw === undefined || raw === '') return isProduction ? 1 : false;
  if (/^\d+$/.test(raw)) return Number(raw);
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return raw;
}

export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new ConfigError(`Configuración inválida: ${issues}`);
  }
  const e = parsed.data;
  const isProduction = e.NODE_ENV === 'production';
  const problems: string[] = [];
  const warnings: string[] = [];

  let tokenSecret = (e.AUTH_SECRET || e.AUTH_PEPPER || '').trim();
  if (!tokenSecret || PUBLIC_EXAMPLE_SECRETS.has(tokenSecret)) {
    if (isProduction) problems.push('AUTH_SECRET falta o es un valor de ejemplo (usá 32+ caracteres aleatorios)');
    tokenSecret = crypto.randomBytes(32).toString('hex');
    warnings.push('AUTH_SECRET no configurado: se generó uno efímero (las sesiones se invalidan al reiniciar)');
  } else if (isProduction && tokenSecret.length < 32) {
    problems.push('AUTH_SECRET tiene que tener al menos 32 caracteres');
  }

  let walletPepper = (e.WALLET_PEPPER || '').trim();
  if (!walletPepper || (isProduction && PUBLIC_EXAMPLE_SECRETS.has(walletPepper))) {
    if (isProduction) {
      problems.push(
        'WALLET_PEPPER falta o es un valor de ejemplo. Para rotarlo sin perder las wallets custodiales, ' +
          'poné el valor viejo en WALLET_PEPPER_PREVIOUS.',
      );
    }
    walletPepper = walletPepper || LEGACY_DEV_WALLET_PEPPER;
    warnings.push('WALLET_PEPPER no configurado: se usa el valor de desarrollo (no apto para producción)');
  }

  const hackathon = e.HACKATHON_DEMO ?? false;
  const isTestnet = e.STELLAR_NETWORK_PASSPHRASE.includes('Test SDF');

  const config: AppConfig = {
    env: e.NODE_ENV,
    isProduction,
    http: {
      port: e.PORT,
      host: e.HOST,
      trustProxy: parseTrustProxy(e.TRUST_PROXY, isProduction),
      corsOrigins: e.CORS_ORIGINS,
      allowPrivateNetworkOrigins: !isProduction,
    },
    log: { level: e.LOG_LEVEL ?? (e.NODE_ENV === 'test' ? 'silent' : 'info') },
    storage: {
      dataDir: path.resolve(e.DATA_DIR || path.join(API_ROOT, 'data')),
      databaseUrl: e.DATABASE_URL || undefined,
      envFile: path.resolve(e.ENV_FILE || path.join(REPO_ROOT, '.env')),
    },
    auth: {
      tokenSecret,
      sessionTtlMs: e.SESSION_TTL_HOURS * 3_600_000,
      walletPepper,
      walletPepperPrevious: e.WALLET_PEPPER_PREVIOUS?.trim() || undefined,
      adminEmails: e.ADMIN_EMAILS.map((m) => m.toLowerCase()),
      adminBootstrapPassword: e.ADMIN_BOOTSTRAP_PASSWORD || undefined,
      firebaseProjectId: e.FIREBASE_PROJECT_ID?.trim() || undefined,
      adminRequire2fa: e.ADMIN_REQUIRE_2FA ?? isProduction,
      requireEmailVerification: e.REQUIRE_EMAIL_VERIFICATION ?? isProduction,
      // `__Host-` binds the cookie to this exact origin; it requires HTTPS.
      cookie: { name: isProduction ? '__Host-fc_session' : 'fc_session', secure: isProduction },
    },
    mail: {
      appUrl: (e.APP_URL || `http://localhost:${e.PORT}`).replace(/\/+$/, ''),
      smtpUrl: e.SMTP_URL?.trim() || undefined,
      from: e.MAIL_FROM,
    },
    demo: {
      hackathon,
      // The fixed test account is a convenience for local demos; a public
      // host must opt in explicitly.
      seedAccounts: e.DEMO_SEED_ACCOUNTS ?? !isProduction,
      // There is no KYC provider behind the onboarding form: on testnet the
      // only alternative to auto-approval is stranding users on "pending".
      kycAutoApprove: e.KYC_AUTO_APPROVE ?? (hackathon || isTestnet),
      kycEnforceHours: e.KYC_ENFORCE_HOURS ?? false,
    },
    stellar: {
      network: e.STELLAR_NETWORK,
      horizonUrl: e.STELLAR_HORIZON_URL,
      rpcUrl: e.STELLAR_RPC_URL,
      friendbotUrl: e.STELLAR_FRIENDBOT_URL,
      networkPassphrase: e.STELLAR_NETWORK_PASSPHRASE,
      explorerUrl: e.STELLAR_EXPLORER_URL.replace(/\/+$/, ''),
      deploymentFile: resolveDeploymentFile(e.STELLAR_DEPLOYMENT_FILE),
      xlmFloor: e.STELLAR_XLM_FLOOR,
      xlmTopUp: Math.max(e.STELLAR_XLM_FLOOR, e.STELLAR_XLM_TOPUP),
      usdcGrant: e.STELLAR_USDC_GRANT,
      usdcCode: e.STELLAR_USDC_CODE,
      isTestnet,
    },
    jobs: { settlementSweepMs: e.SETTLEMENT_SWEEP_MS },
  };

  if (problems.length) {
    throw new ConfigError(`No se puede arrancar en producción:\n - ${problems.join('\n - ')}`);
  }
  configWarnings = warnings;
  return config;
}

let configWarnings: string[] = [];

/** Non-fatal configuration notes collected by the last `loadConfig` call. */
export function lastConfigWarnings(): readonly string[] {
  return configWarnings;
}
