import crypto from 'crypto';

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/=+$/g, '').replace(/\s+/g, '');
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of clean) {
    const idx = BASE32.indexOf(char);
    if (idx < 0) throw new Error('Secreto base32 inválido');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export interface TotpCheck {
  valid: boolean;
  /** Time step that matched — persisted to refuse replays of the same code. */
  step?: number;
}

/**
 * RFC 6238 TOTP (HMAC-SHA1, 6 digits, 30 s), the profile every authenticator
 * app (Google Authenticator, 1Password, Authy…) speaks. Accepts one step of
 * clock drift either way and refuses a step at or before the last one used.
 */
export class TotpService {
  static readonly PERIOD_SECONDS = 30;
  static readonly DIGITS = 6;

  constructor(
    private readonly issuer: string,
    private readonly now: () => number = Date.now,
  ) {}

  generateSecret(): string {
    return base32Encode(crypto.randomBytes(20));
  }

  otpauthUrl(secret: string, accountLabel: string): string {
    const label = encodeURIComponent(`${this.issuer}:${accountLabel}`);
    const params = new URLSearchParams({
      secret,
      issuer: this.issuer,
      algorithm: 'SHA1',
      digits: String(TotpService.DIGITS),
      period: String(TotpService.PERIOD_SECONDS),
    });
    return `otpauth://totp/${label}?${params.toString()}`;
  }

  codeAt(secret: string, step: number): string {
    const counter = Buffer.alloc(8);
    counter.writeBigUInt64BE(BigInt(step));
    const hmac = crypto.createHmac('sha1', base32Decode(secret)).update(counter).digest();
    const offset = hmac[hmac.length - 1] & 0x0f;
    const binary = (hmac.readUInt32BE(offset) & 0x7fffffff) % 10 ** TotpService.DIGITS;
    return String(binary).padStart(TotpService.DIGITS, '0');
  }

  currentStep(): number {
    return Math.floor(this.now() / 1000 / TotpService.PERIOD_SECONDS);
  }

  verify(secret: string, code: string, lastUsedStep?: number): TotpCheck {
    const normalized = String(code ?? '').replace(/\s+/g, '');
    if (!/^\d{6}$/.test(normalized)) return { valid: false };
    const current = this.currentStep();
    for (const step of [current, current - 1, current + 1]) {
      if (lastUsedStep !== undefined && step <= lastUsedStep) continue;
      const expected = Buffer.from(this.codeAt(secret, step));
      const actual = Buffer.from(normalized);
      if (crypto.timingSafeEqual(expected, actual)) return { valid: true, step };
    }
    return { valid: false };
  }
}

/** One-time recovery codes (`XXXXX-XXXXX`), stored only as SHA-256. */
export class RecoveryCodes {
  static generate(count = 10): string[] {
    return Array.from({ length: count }, () => {
      const raw = base32Encode(crypto.randomBytes(7)).slice(0, 10);
      return `${raw.slice(0, 5)}-${raw.slice(5)}`;
    });
  }

  static hash(code: string): string {
    return crypto
      .createHash('sha256')
      .update(
        code
          .trim()
          .toUpperCase()
          .replace(/[^A-Z2-7]/g, ''),
      )
      .digest('hex');
  }
}
