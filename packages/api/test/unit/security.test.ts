import crypto from 'crypto';
import { describe, expect, it } from 'vitest';
import { Keypair } from '@stellar/stellar-sdk';
import { ScryptPasswordHasher } from '../../src/infrastructure/security/PasswordHasher';
import { HmacTokenService, PersistentRevocationList } from '../../src/infrastructure/security/TokenService';
import { AesGcmSecretCipher } from '../../src/infrastructure/security/SecretCipher';
import { Sep53WalletSignatureVerifier } from '../../src/infrastructure/security/WalletSignatureVerifier';
import { InMemoryDocumentStore } from '../../src/infrastructure/persistence/DocumentStore';
import type { IClock } from '../../src/shared/clock';
import { DiditClient, canonicalJson, verifyDiditWebhook } from '../../src/infrastructure/kyc/DiditClient';

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

describe('Didit webhook signatures', () => {
  const secret = 'whsec';
  const body = {
    session_id: 'abc',
    status: 'Approved',
    decision: { score: 98.0, name: 'Peña' },
    a: [2.5, 3.0],
  };

  it('canonicalizes like Didit: sorted keys, whole floats as ints, Unicode kept', () => {
    expect(canonicalJson({ b: 1, a: { d: 1.0, c: 'ñ' } })).toBe('{"a":{"c":"ñ","d":1},"b":1}');
  });

  it('accepts V2 and raw-body signatures within 5 minutes, including rotation headers', () => {
    const now = 1_730_000_000_000;
    const ts = String(now / 1000);
    const v2 = crypto.createHmac('sha256', secret).update(canonicalJson(body)).digest('hex');
    const raw = Buffer.from(JSON.stringify(body));
    const v1 = crypto.createHmac('sha256', secret).update(raw).digest('hex');
    expect(verifyDiditWebhook(secret, { timestamp: ts, signatureV2: [v2] }, undefined, body, now)).toBe(true);
    expect(verifyDiditWebhook(secret, { timestamp: ts, signature: [v1] }, raw, body, now)).toBe(true);
    expect(
      verifyDiditWebhook(
        secret,
        { timestamp: ts, signatureV2: ['00', v2.toUpperCase()] },
        undefined,
        body,
        now,
      ),
    ).toBe(true);
    expect(
      verifyDiditWebhook(
        secret,
        { timestamp: ts, signatureV2: [v2] },
        undefined,
        { ...body, status: 'Declined' },
        now,
      ),
    ).toBe(false);
    expect(
      verifyDiditWebhook(
        secret,
        { timestamp: String(now / 1000 - 301), signatureV2: [v2] },
        undefined,
        body,
        now,
      ),
    ).toBe(false);
    expect(verifyDiditWebhook('', { timestamp: ts, signatureV2: [v2] }, undefined, body, now)).toBe(false);
  });

  it('keeps only a summary of the Didit decision', () => {
    const d = DiditClient.toDecision({
      session_id: 's1',
      status: 'Approved',
      vendor_data: 'acc-1',
      id_verifications: [
        {
          status: 'Approved',
          first_name: 'Ana',
          last_name: 'Paz',
          document_number: 'X12345678',
          issuing_state: 'ARG',
        },
      ],
      liveness_checks: [{ status: 'Approved' }],
      aml_screenings: [{ status: 'Approved', total_hits: 0 }],
    });
    expect(d.identity).toEqual({
      fullName: 'Ana Paz',
      documentType: undefined,
      documentNumberLast4: '5678',
      nationality: undefined,
      issuingState: 'ARG',
    });
    expect(d.checks).toMatchObject({
      document: 'Approved',
      liveness: 'Approved',
      aml: 'Approved',
      amlHits: 0,
    });
  });

  it('sends the API key and workflow when creating a session', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const client = new DiditClient({
      apiKey: 'k',
      workflowId: 'wf',
      baseUrl: 'https://verification.didit.me/',
      fetchImpl: async (url, init) => {
        calls.push({ url: String(url), init: init! });
        return new Response(
          JSON.stringify({
            session_id: 'sid-123456',
            url: 'https://verify.didit.me/session/t',
            status: 'Not Started',
          }),
          { status: 201 },
        );
      },
    });
    const s = await client.startSession({
      accountId: 'acc',
      email: 'a@b.co',
      callbackUrl: 'https://app/cb',
      language: 'es',
    });
    expect(s.url).toBe('https://verify.didit.me/session/t');
    expect(calls[0].url).toBe('https://verification.didit.me/v3/session/');
    expect((calls[0].init.headers as Record<string, string>)['x-api-key']).toBe('k');
    expect(JSON.parse(String(calls[0].init.body))).toMatchObject({
      workflow_id: 'wf',
      vendor_data: 'acc',
      callback: 'https://app/cb',
      language: 'es',
    });
    await expect(client.fetchDecision('../../admin')).rejects.toThrow();
  });
});
