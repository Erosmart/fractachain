import crypto from 'crypto';
import { describe, expect, it } from 'vitest';
import { Keypair } from '@stellar/stellar-sdk';
import { ScryptPasswordHasher } from '../../src/infrastructure/security/PasswordHasher';
import { HmacTokenService, PersistentRevocationList } from '../../src/infrastructure/security/TokenService';
import { AesGcmSecretCipher } from '../../src/infrastructure/security/SecretCipher';
import { Sep53WalletSignatureVerifier } from '../../src/infrastructure/security/WalletSignatureVerifier';
import { InMemoryDocumentStore } from '../../src/infrastructure/persistence/DocumentStore';
import type { IClock } from '../../src/shared/clock';

class FakeClock implements IClock {
  constructor(public t = 1_800_000_000_000) {}
  now() {
    return this.t;
  }
  isoNow() {
    return new Date(this.t).toISOString();
  }
}

describe('ScryptPasswordHasher', () => {
  const hasher = new ScryptPasswordHasher();

  it('hashes with a per-user salt and verifies', async () => {
    const a = await hasher.hash('correct horse');
    const b = await hasher.hash('correct horse');
    expect(a).not.toEqual(b);
    expect(a.startsWith('scrypt$')).toBe(true);
    expect(await hasher.verify('correct horse', a)).toEqual({ valid: true, needsRehash: false });
    expect((await hasher.verify('wrong', a)).valid).toBe(false);
  });

  it('accepts v1 unsalted SHA-256 hashes and flags them for rehash', async () => {
    const legacy = crypto.createHash('sha256').update('fc:hunter22').digest('hex');
    expect(await hasher.verify('hunter22', legacy)).toEqual({ valid: true, needsRehash: true });
    expect((await hasher.verify('nope', legacy)).valid).toBe(false);
  });

  it('rejects empty or malformed stored hashes', async () => {
    expect((await hasher.verify('x', '')).valid).toBe(false);
    expect((await hasher.verify('x', 'scrypt$garbage')).valid).toBe(false);
  });
});

describe('HmacTokenService', () => {
  const setup = () => {
    const clock = new FakeClock();
    const revocations = new PersistentRevocationList(new InMemoryDocumentStore(), clock);
    return { clock, tokens: new HmacTokenService('s'.repeat(40), 60_000, revocations, clock) };
  };

  it('issues tokens that verify to the account', () => {
    const { tokens } = setup();
    const issued = tokens.issue('usr_1');
    expect(issued.token.startsWith('fc2.')).toBe(true);
    expect(tokens.verify(issued.token)?.sub).toBe('usr_1');
  });

  it('rejects tampered, foreign-key and v1 tokens', () => {
    const { tokens, clock } = setup();
    const { token } = tokens.issue('usr_1');
    const [p, body, mac] = token.split('.');
    const forged = Buffer.from(
      JSON.stringify({ ...JSON.parse(Buffer.from(body, 'base64url').toString()), sub: 'admin' }),
    ).toString('base64url');
    expect(tokens.verify(`${p}.${forged}.${mac}`)).toBeNull();
    const other = new HmacTokenService(
      'x'.repeat(40),
      60_000,
      new PersistentRevocationList(new InMemoryDocumentStore(), clock),
      clock,
    );
    expect(other.verify(token)).toBeNull();
    expect(tokens.verify('fc1.usr_1.123.abcdef')).toBeNull();
  });

  it('expires tokens and honours logout revocation', () => {
    const { tokens, clock } = setup();
    const a = tokens.issue('usr_1');
    const b = tokens.issue('usr_1');
    expect(tokens.revoke(a.token)).toBe(true);
    expect(tokens.verify(a.token)).toBeNull();
    expect(tokens.verify(b.token)).not.toBeNull();
    clock.t += 60_001;
    expect(tokens.verify(b.token)).toBeNull();
  });
});

describe('AesGcmSecretCipher', () => {
  it('round-trips and detects tampering', () => {
    const cipher = new AesGcmSecretCipher('pepper-one');
    const sealed = cipher.seal('SSECRET');
    expect(cipher.isSealed(sealed)).toBe(true);
    expect(cipher.open(sealed).plain).toBe('SSECRET');
    const parts = sealed.split(':');
    parts[3] = (parts[3][0] === '0' ? '1' : '0') + parts[3].slice(1);
    expect(() => cipher.open(parts.join(':'))).toThrow();
  });

  it('opens secrets sealed with the previous pepper and re-seals them', () => {
    const old = new AesGcmSecretCipher('old-pepper');
    const sealed = old.seal('SOLD');
    const rotated = new AesGcmSecretCipher('new-pepper', 'old-pepper');
    const { plain, resealed } = rotated.open(sealed);
    expect(plain).toBe('SOLD');
    expect(resealed).toBeDefined();
    expect(new AesGcmSecretCipher('new-pepper').open(resealed!).plain).toBe('SOLD');
  });

  it('is compatible with the v1 envelope format', () => {
    const key = crypto.scryptSync('fractachain-dev-wallet', 'fractachain-wallet', 32);
    const iv = crypto.randomBytes(12);
    const c = crypto.createCipheriv('aes-256-gcm', key, iv);
    const enc = Buffer.concat([c.update('SV1', 'utf8'), c.final()]);
    const v1 = `enc:${iv.toString('hex')}:${c.getAuthTag().toString('hex')}:${enc.toString('hex')}`;
    expect(new AesGcmSecretCipher('fractachain-dev-wallet').open(v1).plain).toBe('SV1');
  });
});

describe('Sep53WalletSignatureVerifier', () => {
  it('accepts a fresh signature once and refuses replays', () => {
    const clock = new FakeClock();
    const verifier = new Sep53WalletSignatureVerifier(clock);
    const kp = Keypair.random();
    const message = `fractachain-login:${clock.now()}`;
    const signature = Buffer.from(kp.sign(Buffer.from(message, 'utf8'))).toString('base64');
    expect(verifier.verify('login', kp.publicKey(), message, signature)).toBeNull();
    expect(verifier.verify('login', kp.publicKey(), message, signature)).toMatch(/ya se usó/);
  });

  it('rejects stale messages, wrong purpose and foreign keys', () => {
    const clock = new FakeClock();
    const verifier = new Sep53WalletSignatureVerifier(clock);
    const kp = Keypair.random();
    const sign = (m: string) => Buffer.from(kp.sign(Buffer.from(m, 'utf8'))).toString('base64');
    const stale = `fractachain-login:${clock.now() - 10 * 60_000}`;
    expect(verifier.verify('login', kp.publicKey(), stale, sign(stale))).toMatch(/vencido/);
    const link = `fractachain-link:${clock.now()}`;
    expect(verifier.verify('login', kp.publicKey(), link, sign(link))).toMatch(/vencido/);
    const msg = `fractachain-login:${clock.now()}`;
    expect(verifier.verify('login', Keypair.random().publicKey(), msg, sign(msg))).toBe('Firma inválida');
  });
});
