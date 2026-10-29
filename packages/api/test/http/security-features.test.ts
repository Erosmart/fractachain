import fs from 'fs';
import os from 'os';
import path from 'path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config/env';
import { buildContainer, type Container } from '../../src/container';
import type { IMailer, MailMessage } from '../../src/infrastructure/mail/Mailer';
import { InMemoryDocumentStore } from '../../src/infrastructure/persistence/DocumentStore';
import { TotpService } from '../../src/infrastructure/security/Totp';
import { InMemorySecretStore } from '../../src/infrastructure/stellar/SecretStore';
import type { IClock } from '../../src/shared/clock';
import { NullLogger } from '../../src/shared/logger';

/** Inbox that keeps every message, so tests can follow the links. */
class CapturingMailer implements IMailer {
  readonly sent: MailMessage[] = [];
  async send(message: MailMessage): Promise<void> {
    this.sent.push(message);
  }
  lastLinkTo(email: string, page: string): string {
    const msg = [...this.sent].reverse().find((m) => m.to === email && m.text.includes(page));
    const match = msg?.text.match(/token=([^\s]+)/);
    if (!match) throw new Error(`no ${page} link for ${email}`);
    return decodeURIComponent(match[1]);
  }
}

class MovableClock implements IClock {
  t = Date.now();
  now() {
    return this.t;
  }
  isoNow() {
    return new Date(this.t).toISOString();
  }
}

const ADMIN = 'admin@fractachain.test';
const ADMIN_PASSWORD = 'admin-bootstrap-pass';
const COOKIE = 'fc_session';

let container: Container;
let dataDir: string;
const mailer = new CapturingMailer();
const clock = new MovableClock();

beforeAll(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fc-sec-'));
  const config = loadConfig({
    NODE_ENV: 'test',
    DATA_DIR: dataDir,
    AUTH_SECRET: 'b'.repeat(48),
    WALLET_PEPPER: 'test-wallet-pepper',
    ADMIN_EMAILS: ADMIN,
    ADMIN_BOOTSTRAP_PASSWORD: ADMIN_PASSWORD,
    ADMIN_REQUIRE_2FA: 'true',
    REQUIRE_EMAIL_VERIFICATION: 'true',
    APP_URL: 'https://app.fractachain.test',
    DEMO_SEED_ACCOUNTS: 'false',
    SETTLEMENT_SWEEP_MS: '0',
    STELLAR_HORIZON_URL: 'http://127.0.0.1:9',
    STELLAR_RPC_URL: 'http://127.0.0.1:9',
    STELLAR_FRIENDBOT_URL: 'http://127.0.0.1:9',
  });
  container = await buildContainer(config, new NullLogger(), {
    store: new InMemoryDocumentStore(),
    secrets: new InMemorySecretStore(),
    mailer,
    clock,
  });
  await container.bootstrap.run();
});

afterAll(() => fs.rmSync(dataDir, { recursive: true, force: true }));

const api = () => request(container.app);
const sessionCookie = (res: request.Response) =>
  (res.headers['set-cookie'] as unknown as string[] | undefined)
    ?.find((c) => c.startsWith(`${COOKIE}=`))
    ?.split(';')[0];

describe('cookie session + CSRF', () => {
  it('sets an HttpOnly SameSite=Strict cookie and accepts it for reads', async () => {
    const res = await api()
      .post('/api/auth/email')
      .send({ email: 'cookie@example.com', password: 'cookie-pass-1' });
    expect(res.status).toBe(200);
    const raw = (res.headers['set-cookie'] as unknown as string[]).join(';');
    expect(raw).toMatch(/HttpOnly/i);
    expect(raw).toMatch(/SameSite=Strict/i);
    const me = await api().get('/api/auth/me').set('Cookie', sessionCookie(res)!);
    expect(me.status).toBe(200);
    expect(me.body.user.emailVerified).toBe(false);
  });

  it('refuses cookie-authenticated writes without the CSRF header or from another origin', async () => {
    const login = await api()
      .post('/api/auth/email')
      .send({ email: 'csrf@example.com', password: 'csrf-pass-12' });
    const cookie = sessionCookie(login)!;
    const bare = await api().post('/api/auth/logout').set('Cookie', cookie);
    expect(bare.status).toBe(403);
    expect(bare.body.code).toBe('CSRF');
    const foreign = await api()
      .post('/api/auth/logout')
      .set('Cookie', cookie)
      .set('X-Requested-With', 'fractachain')
      .set('Origin', 'https://evil.example');
    expect(foreign.status).toBe(403);
    const ok = await api()
      .post('/api/auth/logout')
      .set('Cookie', cookie)
      .set('X-Requested-With', 'fractachain');
    expect(ok.status).toBe(200);
    expect((ok.headers['set-cookie'] as unknown as string[]).join(';')).toMatch(/fc_session=;/);
    expect((await api().get('/api/auth/me').set('Cookie', cookie)).status).toBe(401);
  });
});

describe('email verification and password reset', () => {
  it('sends a verification link and gates KYC until it is used', async () => {
    const login = await api()
      .post('/api/auth/email')
      .send({ email: 'vera@example.com', password: 'vera-pass-12' });
    const bearer = `Bearer ${login.body.token}`;
    await api().post('/api/auth/wallet').set('Authorization', bearer).send({ mode: 'SELF' });
    const blocked = await api()
      .post('/api/kyc/onboard')
      .set('Authorization', bearer)
      .send({ legalName: 'Vera', cuit: '20123456789', email: 'x' });
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe('EMAIL_NOT_VERIFIED');

    const token = mailer.lastLinkTo('vera@example.com', '/verify-email');
    const verified = await api().post('/api/auth/email/verify').send({ token });
    expect(verified.status).toBe(200);
    expect(verified.body.data.user.emailVerified).toBe(true);
  });

  it('resets the password through the emailed link and kills old sessions', async () => {
    const login = await api()
      .post('/api/auth/email')
      .send({ email: 'rita@example.com', password: 'rita-old-pass' });
    const oldToken = login.body.token as string;
    expect((await api().post('/api/auth/password/forgot').send({ email: 'nobody@example.com' })).status).toBe(
      200,
    );
    expect((await api().post('/api/auth/password/forgot').send({ email: 'rita@example.com' })).status).toBe(
      200,
    );
    const token = mailer.lastLinkTo('rita@example.com', '/reset-password');

    clock.t += 1_000;
    const reset = await api().post('/api/auth/password/reset').send({ token, password: 'rita-new-pass' });
    expect(reset.status).toBe(200);
    expect(sessionCookie(reset)).toBeDefined();
    expect((await api().get('/api/auth/me').set('Authorization', `Bearer ${oldToken}`)).status).toBe(401);
    expect(
      (await api().post('/api/auth/password/reset').send({ token, password: 'another-pass-1' })).status,
    ).toBe(400);
    expect(
      (await api().post('/api/auth/email').send({ email: 'rita@example.com', password: 'rita-new-pass' }))
        .status,
    ).toBe(200);
  });
});

describe('two-factor authentication', () => {
  const totp = new TotpService('Fractachain', () => clock.now());
  /** The admin's authenticator secret, as scanned from the QR during enrollment. */
  let adminSecret = '';

  it('requires 2FA for admin routes when enforced, then lets the enrolled admin in', async () => {
    const login = await api().post('/api/auth/email').send({ email: ADMIN, password: ADMIN_PASSWORD });
    const bearer = `Bearer ${login.body.token}`;
    const refused = await api().get('/api/admin/audit').set('Authorization', bearer);
    expect(refused.status).toBe(403);
    expect(refused.body.code).toBe('TWO_FACTOR_REQUIRED');

    const setup = await api().post('/api/auth/2fa/setup').set('Authorization', bearer);
    const { secret, otpauthUrl } = setup.body.data;
    adminSecret = secret;
    expect(otpauthUrl).toContain('otpauth://totp/');
    expect(
      (await api().post('/api/auth/2fa/enable').set('Authorization', bearer).send({ code: '000000' })).status,
    ).toBe(401);
    const enabled = await api()
      .post('/api/auth/2fa/enable')
      .set('Authorization', bearer)
      .send({ code: totp.codeAt(secret, totp.currentStep()) });
    expect(enabled.status).toBe(200);
    expect(enabled.body.data.recoveryCodes).toHaveLength(10);
    expect(enabled.body.data.user.twoFactorEnabled).toBe(true);
    expect((await api().get('/api/admin/audit').set('Authorization', bearer)).status).toBe(200);

    // A new login now stops at the challenge: no token, no cookie.
    const step1 = await api().post('/api/auth/email').send({ email: ADMIN, password: ADMIN_PASSWORD });
    expect(step1.body.twoFactorRequired).toBe(true);
    expect(step1.body.token).toBeUndefined();
    expect(sessionCookie(step1)).toBeUndefined();
    expect(
      (await api().post('/api/auth/2fa/verify').send({ challenge: step1.body.challenge, code: '123456' }))
        .status,
    ).toBe(401);

    clock.t += 30_000; // the enrollment step cannot be replayed
    const step2 = await api()
      .post('/api/auth/2fa/verify')
      .send({ challenge: step1.body.challenge, code: totp.codeAt(secret, totp.currentStep()) });
    expect(step2.status).toBe(200);
    expect(step2.body.token).toMatch(/^fc2\./);
    expect(sessionCookie(step2)).toBeDefined();

    // Recovery codes work exactly once.
    const step3 = await api().post('/api/auth/email').send({ email: ADMIN, password: ADMIN_PASSWORD });
    const recovery = enabled.body.data.recoveryCodes[0];
    expect(
      (await api().post('/api/auth/2fa/verify').send({ challenge: step3.body.challenge, code: recovery }))
        .status,
    ).toBe(200);
    const step4 = await api().post('/api/auth/email').send({ email: ADMIN, password: ADMIN_PASSWORD });
    expect(
      (await api().post('/api/auth/2fa/verify').send({ challenge: step4.body.challenge, code: recovery }))
        .status,
    ).toBe(401);
  });

  it('records security events in the audit trail', async () => {
    const step1 = await api().post('/api/auth/email').send({ email: ADMIN, password: ADMIN_PASSWORD });
    clock.t += 30_000;
    const login = await api()
      .post('/api/auth/2fa/verify')
      .send({ challenge: step1.body.challenge, code: totp.codeAt(adminSecret, totp.currentStep()) });
    expect(login.status).toBe(200);
    const audit = await api()
      .get('/api/admin/audit?limit=50')
      .set('Authorization', `Bearer ${login.body.token}`);
    expect(audit.status).toBe(200);
    const actions = audit.body.data.map((e: { action: string }) => e.action);
    expect(actions).toEqual(
      expect.arrayContaining([
        'auth.login.email',
        'auth.2fa.enable',
        'auth.login.2fa',
        'auth.password.reset',
      ]),
    );
    const failed = audit.body.data.find(
      (e: { action: string; outcome: string }) => e.action === 'auth.login.2fa' && e.outcome === 'failure',
    );
    expect(failed).toBeDefined();
    expect(JSON.stringify(audit.body.data)).not.toMatch(/admin-bootstrap-pass|recoveryCodes/);
  });
});
