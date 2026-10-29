import { describe, expect, it } from 'vitest';
import {
  RecoveryCodes,
  TotpService,
  base32Decode,
  base32Encode,
} from '../../src/infrastructure/security/Totp';
import { SignedTokenCodec } from '../../src/infrastructure/security/SignedTokens';
import type { IClock } from '../../src/shared/clock';

// RFC 6238 appendix B test secret: ASCII "12345678901234567890".
const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890'));

describe('TotpService (RFC 6238)', () => {
  it('matches the RFC test vectors (SHA-1, last 6 digits)', () => {
    const totp = new TotpService('Fractachain');
    const vectors: [number, string][] = [
      [59, '287082'],
      [1111111109, '081804'],
      [1234567890, '005924'],
      [2000000000, '279037'],
    ];
    for (const [seconds, code] of vectors) {
      expect(totp.codeAt(RFC_SECRET, Math.floor(seconds / 30))).toBe(code);
    }
  });

  it('accepts ±1 step of drift and refuses replays of a used step', () => {
    let now = 1234567890_000;
    const totp = new TotpService('Fractachain', () => now);
    const step = totp.currentStep();
    const code = totp.codeAt(RFC_SECRET, step);
    const first = totp.verify(RFC_SECRET, code);
    expect(first).toEqual({ valid: true, step });
    expect(totp.verify(RFC_SECRET, code, first.step).valid).toBe(false);
    now += 30_000;
    expect(totp.verify(RFC_SECRET, code).valid).toBe(true); // previous step still tolerated
    expect(totp.verify(RFC_SECRET, '000000').valid).toBe(false);
    expect(totp.verify(RFC_SECRET, 'abc').valid).toBe(false);
  });

  it('round-trips base32 and builds an otpauth URL', () => {
    expect(base32Decode(base32Encode(Buffer.from('hola mundo'))).toString()).toBe('hola mundo');
    const url = new TotpService('Fractachain').otpauthUrl('ABC', 'ana@example.com');
    expect(url).toMatch(/^otpauth:\/\/totp\/Fractachain%3Aana%40example\.com\?/);
    expect(url).toContain('secret=ABC');
  });

  it('generates distinct recovery codes and hashes them canonically', () => {
    const codes = RecoveryCodes.generate();
    expect(new Set(codes).size).toBe(10);
    expect(codes[0]).toMatch(/^[A-Z2-7]{5}-[A-Z2-7]{5}$/);
    expect(RecoveryCodes.hash(codes[0].toLowerCase().replace('-', ''))).toBe(RecoveryCodes.hash(codes[0]));
  });
});

describe('SignedTokenCodec', () => {
  const clock: IClock & { t: number } = {
    t: 1_000_000,
    now() {
      return this.t;
    },
    isoNow() {
      return new Date(this.t).toISOString();
    },
  };
  const codec = new SignedTokenCodec('k'.repeat(40), clock);

  it('binds tokens to a purpose, an expiry and a fingerprint', () => {
    const { token } = codec.issue('password-reset', 'usr_1', 60_000, 'fp-1');
    expect(codec.verify('password-reset', token, () => 'fp-1')?.sub).toBe('usr_1');
    expect(codec.verify('email-verify', token, () => 'fp-1')).toBeNull();
    expect(codec.verify('password-reset', token, () => 'fp-2')).toBeNull();
    clock.t += 60_001;
    expect(codec.verify('password-reset', token, () => 'fp-1')).toBeNull();
  });

  it('rejects forged tokens', () => {
    const { token } = codec.issue('two-factor', 'usr_1', 60_000);
    const [body] = token.split('.');
    const forged = Buffer.from(
      JSON.stringify({ purpose: 'two-factor', sub: 'admin', exp: Date.now() * 2 }),
    ).toString('base64url');
    expect(codec.verify('two-factor', `${forged}.${token.split('.')[1]}`)).toBeNull();
    expect(codec.verify('two-factor', `${body}.AAAA`)).toBeNull();
  });
});
