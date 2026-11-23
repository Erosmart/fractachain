import crypto from 'crypto';
import { promisify } from 'util';

const scryptAsync = promisify(crypto.scrypt) as (
  password: crypto.BinaryLike,
  salt: crypto.BinaryLike,
  keylen: number,
  options: crypto.ScryptOptions,
) => Promise<Buffer>;

export interface PasswordCheck {
  valid: boolean;
  /** The stored hash uses an outdated scheme; persist `hash(password)` after a successful login. */
  needsRehash: boolean;
}

/** Async on purpose: scrypt is CPU-heavy and must run on libuv's pool, not the event loop. */
export interface IPasswordHasher {
  hash(password: string): Promise<string>;
  verify(password: string, stored: string): Promise<PasswordCheck>;
}

const SCRYPT_N = 1 << 15;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 64;
const SALT_LEN = 16;
/** scrypt with N=2^15, r=8 needs 32 MiB; Node's default cap is exactly that. */
const MAX_MEM = 64 * 1024 * 1024;

function timingSafeEqualStr(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

/**
 * scrypt with a per-user random salt, encoded as
 * `scrypt$<N>$<r>$<p>$<salt b64>$<hash b64>` so parameters can be raised later
 * without breaking existing hashes.
 *
 * v1 stored `sha256("fc:" + password)`: unsalted and fast, so one GPU could
 * test billions of guesses per second against a leaked `users.json`. Those
 * hashes still verify (timing-safe) and are flagged for rehash on next login.
 */
export class ScryptPasswordHasher implements IPasswordHasher {
  async hash(password: string): Promise<string> {
    const salt = crypto.randomBytes(SALT_LEN);
    const key = await scryptAsync(password, salt, KEY_LEN, {
      N: SCRYPT_N,
      r: SCRYPT_R,
      p: SCRYPT_P,
      maxmem: MAX_MEM,
    });
    return ['scrypt', SCRYPT_N, SCRYPT_R, SCRYPT_P, salt.toString('base64'), key.toString('base64')].join(
      '$',
    );
  }

  async verify(password: string, stored: string): Promise<PasswordCheck> {
    if (!stored) return { valid: false, needsRehash: false };
    if (stored.startsWith('scrypt$')) {
      const [, n, r, p, saltB64, keyB64] = stored.split('$');
      const N = Number(n);
      const R = Number(r);
      const P = Number(p);
      if (!N || !R || !P || !saltB64 || !keyB64) return { valid: false, needsRehash: false };
      const expected = Buffer.from(keyB64, 'base64');
      const actual = await scryptAsync(password, Buffer.from(saltB64, 'base64'), expected.length, {
        N,
        r: R,
        p: P,
        maxmem: MAX_MEM,
      });
      const valid = actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
      return { valid, needsRehash: valid && (N < SCRYPT_N || R !== SCRYPT_R || P !== SCRYPT_P) };
    }
    if (/^[0-9a-f]{64}$/i.test(stored)) {
      const legacy = crypto.createHash('sha256').update(`fc:${password}`).digest('hex');
      const valid = timingSafeEqualStr(legacy, stored.toLowerCase());
      return { valid, needsRehash: valid };
    }
    return { valid: false, needsRehash: false };
  }
}

/** Password rules for new accounts. Existing v1 passwords (min 6) keep working. */
export class PasswordPolicy {
  static readonly MIN_LENGTH = 8;
  static readonly MAX_LENGTH = 256;

  static assertAcceptable(password: string): string | null {
    if (password.length < PasswordPolicy.MIN_LENGTH) {
      return `La contraseña debe tener al menos ${PasswordPolicy.MIN_LENGTH} caracteres`;
    }
    if (password.length > PasswordPolicy.MAX_LENGTH) return 'La contraseña es demasiado larga';
    return null;
  }
}
