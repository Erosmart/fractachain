import fs from 'fs';
import os from 'os';
import path from 'path';
import { Keypair } from '@stellar/stellar-sdk';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { CustodialBalances, ICustodialFunds } from '../../src/application/account/AccountPrivacyService';
import { AccountPrivacyService } from '../../src/application/account/AccountPrivacyService';
import { loadConfig } from '../../src/config/env';
import { buildContainer, type Container } from '../../src/container';
import { DEFAULT_LEGAL_VERSION as LEGAL, type Account } from '../../src/domain/account/Account';
import type { IMailer, MailMessage } from '../../src/infrastructure/mail/Mailer';
import { InMemoryDocumentStore } from '../../src/infrastructure/persistence/DocumentStore';
import { InMemorySecretStore } from '../../src/infrastructure/stellar/SecretStore';
import type { IClock } from '../../src/shared/clock';
import { AppError } from '../../src/shared/errors';
import { NullLogger } from '../../src/shared/logger';

/**
 * Essential account views: sign-up with Terms acceptance, the Terms gate,
 * password change, the owner's data export and account closure, and the
 * contact channel.
 */
class Inbox implements IMailer {
  readonly sent: MailMessage[] = [];
  async send(message: MailMessage): Promise<void> {
    this.sent.push(message);
  }
  to(email: string): MailMessage[] {
    return this.sent.filter((m) => m.to === email);
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

/** Custodial balances by address (default: nothing held). */
class FakeFunds implements ICustodialFunds {
  readonly byAddress = new Map<string, CustodialBalances>();
  async balances(publicKey: string): Promise<CustodialBalances> {
    return this.byAddress.get(publicKey) ?? { xlm: 1, minimumXlm: 1, assets: [] };
  }
}

const ADMIN = 'admin@fractachain.test';
const ADMIN_PASSWORD = 'admin-bootstrap-pass';
const COOKIE = 'fc_session';

let container: Container;
let dataDir: string;
const inbox = new Inbox();
const clock = new MovableClock();
const funds = new FakeFunds();

beforeAll(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fc-ess-'));
  const config = loadConfig({
    NODE_ENV: 'test',
    DATA_DIR: dataDir,
    AUTH_SECRET: 'e'.repeat(48),
    WALLET_PEPPER: 'test-wallet-pepper',
    ADMIN_EMAILS: ADMIN,
    ADMIN_BOOTSTRAP_PASSWORD: ADMIN_PASSWORD,
    APP_URL: 'https://app.fractachain.test',
    DEMO_SEED_ACCOUNTS: 'false',
    SETTLEMENT_SWEEP_MS: '0',
    // Each test speaks from its own client IP (rate limits are per IP and real-time).
    TRUST_PROXY: '1',
    STELLAR_HORIZON_URL: 'http://127.0.0.1:9',
    STELLAR_RPC_URL: 'http://127.0.0.1:9',
    STELLAR_FRIENDBOT_URL: 'http://127.0.0.1:9',
  });
  container = await buildContainer(config, new NullLogger(), {
    store: new InMemoryDocumentStore(),
    secrets: new InMemorySecretStore(),
    mailer: inbox,
    clock,
    custodialFunds: funds,
  });
  await container.bootstrap.run();
});

afterAll(() => fs.rmSync(dataDir, { recursive: true, force: true }));

let clientIp = 0;
beforeEach(() => {
  clientIp += 1;
});
const api = () =>
  request.agent(container.app).set('X-Forwarded-For', `10.9.${Math.floor(clientIp / 250)}.${clientIp % 250}`);
const bearer = (token: string) => `Bearer ${token}`;
const cookieOf = (res: request.Response) =>
  (res.headers['set-cookie'] as unknown as string[] | undefined)
    ?.find((c) => c.startsWith(`${COOKIE}=`))
    ?.split(';')[0];

async function signUp(email: string, password = 'strong-pass-1', name = 'Ana Pérez') {
  const res = await api()
    .post('/api/auth/register')
    .send({ name, email, password, acceptTerms: true, termsVersion: LEGAL });
  expect(res.status).toBe(201);
  return res.body as { token: string; user: { id: string; termsAccepted: boolean } };
}

function walletLoginPayload(kp: Keypair, purpose = 'login') {
  const message = `fractachain-${purpose}:${clock.now()}`;
  return {
    publicKey: kp.publicKey(),
    message,
    signature: Buffer.from(kp.signMessage(message)).toString('base64'),
  };
}

describe('sign-up and sign-in are separate', () => {
  it('creates the account only with the current Terms, and logs in', async () => {
    const res = await api().post('/api/auth/register').send({
      name: 'Ana',
      email: 'Ana@Example.com',
      password: 'strong-pass-1',
      acceptTerms: true,
      termsVersion: LEGAL,
    });
    expect(res.status).toBe(201);
    expect(cookieOf(res)).toBeDefined();
    expect(res.body.user).toMatchObject({
      email: 'ana@example.com',
      name: 'Ana',
      termsAccepted: true,
      termsVersion: LEGAL,
    });
    expect(inbox.to('ana@example.com').some((m) => m.text.includes('/verify-email'))).toBe(true);
    const legal = await api().get('/api/legal');
    expect(legal.body.data).toEqual({ termsVersion: LEGAL, privacyVersion: LEGAL, updatedAt: LEGAL });
  });

  it('refuses duplicates, missing or outdated Terms and weak passwords', async () => {
    await signUp('dup@example.com');
    const dup = await api().post('/api/auth/register').send({
      name: 'Dup',
      email: 'dup@example.com',
      password: 'strong-pass-2',
      acceptTerms: true,
      termsVersion: LEGAL,
    });
    expect(dup.status).toBe(409);
    expect(dup.body.message).toBe('Ya existe una cuenta con ese email. Ingresá o recuperá tu contraseña.');
    const noTerms = await api()
      .post('/api/auth/register')
      .send({ name: 'X', email: 'x1@example.com', password: 'strong-pass-1' });
    expect(noTerms.status).toBe(400);
    expect(noTerms.body.code).toBe('TERMS_REQUIRED');
    const old = await api().post('/api/auth/register').send({
      name: 'X',
      email: 'x2@example.com',
      password: 'strong-pass-1',
      acceptTerms: true,
      termsVersion: '2020-01-01',
    });
    expect(old.body.code).toBe('TERMS_REQUIRED');
    const weak = await api().post('/api/auth/register').send({
      name: 'X',
      email: 'x3@example.com',
      password: 'short',
      acceptTerms: true,
      termsVersion: LEGAL,
    });
    expect(weak.status).toBe(400);
    expect(weak.body.code).toBe('VALIDATION_FAILED');
  });

  it('never creates an account on sign-in, and an unknown email looks like a wrong password', async () => {
    await signUp('known@example.com');
    const wrong = await api()
      .post('/api/auth/email')
      .send({ email: 'known@example.com', password: 'nope-nope-1' });
    const unknown = await api()
      .post('/api/auth/email')
      .send({ email: 'ghost@example.com', password: 'whatever-123' });
    expect(unknown.status).toBe(401);
    expect(unknown.body).toEqual(wrong.body);
    const again = await api().post('/api/auth/register').send({
      name: 'Ghost',
      email: 'ghost@example.com',
      password: 'strong-pass-1',
      acceptTerms: true,
      termsVersion: LEGAL,
    });
    expect(again.status).toBe(201);
  });

  it('keeps the reserved admin account working with the bootstrap password', async () => {
    const admin = await api().post('/api/auth/email').send({ email: ADMIN, password: ADMIN_PASSWORD });
    expect(admin.status).toBe(200);
    expect(admin.body.user.isAdmin).toBe(true);
  });
});

describe('Terms gate', () => {
  it('asks wallet sign-ups to accept before KYC or trading', async () => {
    const kp = Keypair.random();
    const login = await api().post('/api/auth/freighter').send(walletLoginPayload(kp));
    expect(login.status).toBe(200);
    expect(login.body.user.termsAccepted).toBe(false);
    const auth = bearer(login.body.token);

    const kyc = await api()
      .post('/api/kyc/onboard')
      .set('Authorization', auth)
      .send({ legalName: 'Wally', cuit: '20123456789', email: 'wally@example.com' });
    expect(kyc.status).toBe(403);
    expect(kyc.body.code).toBe('TERMS_REQUIRED');
    const tx = await api()
      .post('/api/tx/build')
      .set('Authorization', auth)
      .send({ action: 'contribute', listingId: 'IPO-NOPE', amount: 10 });
    expect(tx.status).toBe(403);
    expect(tx.body.code).toBe('TERMS_REQUIRED');

    const outdated = await api()
      .post('/api/auth/terms/accept')
      .set('Authorization', auth)
      .send({ version: '2020-01-01' });
    expect(outdated.body.code).toBe('TERMS_REQUIRED');
    const accept = await api()
      .post('/api/auth/terms/accept')
      .set('Authorization', auth)
      .send({ version: LEGAL });
    expect(accept.status).toBe(200);
    expect(accept.body.user).toMatchObject({ termsAccepted: true, termsVersion: LEGAL });

    const ok = await api()
      .post('/api/kyc/onboard')
      .set('Authorization', auth)
      .send({ legalName: 'Wally', cuit: '20123456789', email: 'wally2@example.com' });
    expect(ok.status).toBe(200);
  });

  it('needs a session and the CSRF header with a cookie', async () => {
    expect((await api().post('/api/auth/terms/accept').send({ version: LEGAL })).status).toBe(401);
    const res = await api().post('/api/auth/register').send({
      name: 'C',
      email: 'csrf-terms@example.com',
      password: 'strong-pass-1',
      acceptTerms: true,
      termsVersion: LEGAL,
    });
    const bare = await api()
      .post('/api/auth/terms/accept')
      .set('Cookie', cookieOf(res)!)
      .send({ version: LEGAL });
    expect(bare.body.code).toBe('CSRF');
  });
});

describe('password change', () => {
  it('checks the current password, revokes other sessions and keeps the caller signed in', async () => {
    const first = await signUp('pat@example.com', 'first-pass-1');
    const second = await api()
      .post('/api/auth/email')
      .send({ email: 'pat@example.com', password: 'first-pass-1' });
    const wrong = await api()
      .post('/api/auth/password/change')
      .set('Authorization', bearer(first.token))
      .send({ currentPassword: 'not-it-123', newPassword: 'second-pass-2' });
    expect(wrong.status).toBe(403);
    expect(wrong.body.code).toBe('WRONG_PASSWORD');
    const weak = await api()
      .post('/api/auth/password/change')
      .set('Authorization', bearer(first.token))
      .send({ currentPassword: 'first-pass-1', newPassword: 'short' });
    expect(weak.status).toBe(400);

    clock.t += 1_000;
    const changed = await api()
      .post('/api/auth/password/change')
      .set('Authorization', bearer(first.token))
      .send({ currentPassword: 'first-pass-1', newPassword: 'second-pass-2' });
    expect(changed.status).toBe(200);
    expect(cookieOf(changed)).toBeDefined();
    expect((await api().get('/api/auth/me').set('Authorization', bearer(changed.body.token))).status).toBe(
      200,
    );
    expect((await api().get('/api/auth/me').set('Authorization', bearer(second.body.token))).status).toBe(
      401,
    );
    expect((await api().get('/api/auth/me').set('Authorization', bearer(first.token))).status).toBe(401);
    expect(inbox.to('pat@example.com').some((m) => /contraseña .*cambió/.test(m.subject))).toBe(true);
    const old = await api()
      .post('/api/auth/email')
      .send({ email: 'pat@example.com', password: 'first-pass-1' });
    expect(old.status).toBe(401);
    const fresh = await api()
      .post('/api/auth/email')
      .send({ email: 'pat@example.com', password: 'second-pass-2' });
    expect(fresh.status).toBe(200);
  });
});

describe('data export (Ley 25.326)', () => {
  it('downloads the owner data without secrets', async () => {
    const { token, user } = await signUp('exp@example.com');
    await api().post('/api/support/messages').set('Authorization', bearer(token)).send({
      topic: 'privacy',
      name: 'Exp',
      email: 'exp@example.com',
      message: 'Quiero saber qué datos guardan de mí.',
    });
    const res = await api().get('/api/account/export').set('Authorization', bearer(token));
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toMatch(
      /^attachment; filename="fractachain-mis-datos-\d{4}-\d{2}-\d{2}\.json"$/,
    );
    expect(res.headers['cache-control']).toMatch(/no-store/);
    const data = JSON.parse(res.text);
    expect(data.profile).toMatchObject({ id: user.id, email: 'exp@example.com' });
    expect(data.terms).toMatchObject({ acceptedVersion: LEGAL, currentVersion: LEGAL });
    expect(data.supportMessages).toHaveLength(1);
    expect(data.activity.some((e: { action: string }) => e.action === 'auth.register')).toBe(true);
    expect(res.text).not.toMatch(/passwordHash|scrypt\$|secretKey|enc:|recoveryCodeHashes/);
    expect((await api().get('/api/account/export')).status).toBe(401);
  });
});

describe('closing the account', () => {
  it('needs the password and refuses while the platform holds something', async () => {
    const { token, user } = await signUp('held@example.com', 'held-pass-12');
    const auth = bearer(token);
    expect(
      (await api().post('/api/account/close').set('Authorization', auth).send({ password: 'held-pass-12' }))
        .status,
    ).toBe(400);
    const wrong = await api()
      .post('/api/account/close')
      .set('Authorization', auth)
      .send({ confirm: 'CERRAR', password: 'nope-1234' });
    expect(wrong.status).toBe(403);
    expect(wrong.body.code).toBe('WRONG_PASSWORD');

    const account = container.services.accounts.require(user.id);
    account.holdings = [
      { listingId: 'IPO-X', tokenTicker: 'XTOK', usdcAmount: 20, tokens: 0, tokensOwed: 2 },
    ];
    container.services.accounts.save(account);
    const positions = await api()
      .post('/api/account/close')
      .set('Authorization', auth)
      .send({ confirm: 'CERRAR', password: 'held-pass-12' });
    expect(positions.status).toBe(409);
    expect(positions.body.message).toMatch(/XTOK/);

    account.holdings = [];
    account.custodyMode = 'CUSTODIAL';
    account.publicKey = Keypair.random().publicKey();
    container.services.accounts.save(account);
    funds.byAddress.set(account.publicKey, {
      xlm: 10_000,
      minimumXlm: 1.5,
      assets: [
        { code: 'USDC', issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5', balance: 40 },
      ],
    });
    const custodial = await api()
      .post('/api/account/close')
      .set('Authorization', auth)
      .send({ confirm: 'CERRAR', password: 'held-pass-12' });
    expect(custodial.status).toBe(409);
    expect(custodial.body.message).toMatch(/40 USDC/);
  });

  it('closes an email account: no login, data minimized, the email can sign up again', async () => {
    const { token, user } = await signUp('bye@example.com', 'bye-pass-123', 'Beatriz Ye');
    const other = await api()
      .post('/api/auth/email')
      .send({ email: 'bye@example.com', password: 'bye-pass-123' });
    const res = await api()
      .post('/api/account/close')
      .set('Authorization', bearer(token))
      .send({ confirm: 'CERRAR', password: 'bye-pass-123' });
    expect(res.status).toBe(200);
    expect(res.body.data.closedAt).toBeTruthy();
    expect((res.headers['set-cookie'] as unknown as string[]).join(';')).toMatch(/fc_session=;/);

    expect((await api().get('/api/auth/me').set('Authorization', bearer(token))).status).toBe(401);
    expect((await api().get('/api/auth/me').set('Authorization', bearer(other.body.token))).status).toBe(401);
    expect(
      (await api().post('/api/auth/email').send({ email: 'bye@example.com', password: 'bye-pass-123' }))
        .status,
    ).toBe(401);
    const stored = container.services.accounts.get(user.id) as Account;
    expect(stored.closedAt).toBeTruthy();
    expect(stored.email).not.toContain('bye@example.com');
    expect(stored.name).not.toContain('Beatriz');
    expect(stored.passwordHash).toBeUndefined();
    expect(inbox.to('bye@example.com').some((m) => m.subject.includes('Cerraste tu cuenta'))).toBe(true);

    const reborn = await signUp('bye@example.com', 'new-life-123');
    expect(reborn.user.id).not.toBe(user.id);
  });

  it('closes a wallet account with a SEP-53 signature of the close challenge', async () => {
    const kp = Keypair.random();
    const login = await api().post('/api/auth/freighter').send(walletLoginPayload(kp));
    const auth = bearer(login.body.token);
    const noSig = await api()
      .post('/api/account/close')
      .set('Authorization', auth)
      .send({ confirm: 'CERRAR' });
    expect(noSig.status).toBe(400);
    const stranger = Keypair.random();
    const wrongKey = await api()
      .post('/api/account/close')
      .set('Authorization', auth)
      .send({ confirm: 'CERRAR', signature: walletLoginPayload(stranger, 'close') });
    expect(wrongKey.status).toBe(403);
    const loginSig = await api()
      .post('/api/account/close')
      .set('Authorization', auth)
      .send({ confirm: 'CERRAR', signature: walletLoginPayload(kp, 'login') });
    expect(loginSig.status).toBe(403);

    const closed = await api()
      .post('/api/account/close')
      .set('Authorization', auth)
      .send({ confirm: 'CERRAR', signature: walletLoginPayload(kp, 'close') });
    expect(closed.status).toBe(200);
    expect((await api().get('/api/auth/me').set('Authorization', auth)).status).toBe(401);
    clock.t += 10;
    const back = await api().post('/api/auth/freighter').send(walletLoginPayload(kp));
    expect(back.status).toBe(200);
    expect(back.body.user.id).not.toBe(login.body.user.id);
    expect(back.body.user.termsAccepted).toBe(false);
  });

  it('asks Google accounts for a fresh session', async () => {
    const google = {
      id: 'usr_google_1',
      email: 'g@example.com',
      name: 'G',
      avatar: '',
      custodyMode: null,
      publicKey: '',
      kycStatus: 'UNREGISTERED',
      holdings: [],
      trustlines: [],
      cashUsdc: 0,
      authProvider: 'firebase-google',
      createdAt: clock.isoNow(),
      lastLoginAt: clock.isoNow(),
    } as Account;
    const repo = new Map<string, Account>([[google.id, google]]);
    const service = new AccountPrivacyService(
      { findById: (id: string) => repo.get(id), save: () => undefined } as never,
      { findById: () => undefined, findByUserId: () => undefined, upsert: () => undefined } as never,
      { remove: () => undefined } as never,
      { byActor: () => [] } as never,
      { byAccount: () => [] } as never,
      new InMemoryDocumentStore(),
      funds,
      { verify: () => null },
      { verify: async () => ({ valid: false, needsRehash: false }), hash: async () => '' },
      inbox,
      clock,
      new NullLogger(),
    );
    const stale = await service
      .close(google.id, { confirm: 'CERRAR' }, clock.now() - 11 * 60_000)
      .catch((e) => e);
    expect(stale).toBeInstanceOf(AppError);
    expect((stale as AppError).status).toBe(403);
    const fresh = await service.close(google.id, { confirm: 'CERRAR' }, clock.now() - 60_000);
    expect(fresh.closedAt).toBeTruthy();
  });
});

describe('contact and support', () => {
  it('stores messages, mails the admins and lets them close and reopen', async () => {
    const sent = await api().post('/api/support/messages').send({
      topic: 'issuer',
      name: 'Juan <script>',
      email: 'juan@empresa.com',
      message: 'Queremos tokenizar la próxima cosecha de soja.',
      company: 'Agro Juan S.A.',
      cuit: '30-12345678-9',
      amountUsd: 250000,
    });
    expect(sent.body).toMatchObject({ success: true });
    expect(sent.status).toBe(201);
    const id = sent.body.data.id as string;
    expect(id).toMatch(/^sup_/);
    const mail = inbox.to(ADMIN).find((m) => m.text.includes(id));
    expect(mail?.subject).toContain('Solicitud de emisor');
    expect(mail?.text).toContain('Agro Juan S.A.');

    const bot = await api().post('/api/support/messages').send({
      topic: 'general',
      name: 'Bot',
      email: 'bot@spam.com',
      message: 'Comprá seguidores baratos ya mismo',
      website: 'http://spam',
    });
    expect(bot.status).toBe(201);

    expect((await api().get('/api/admin/support')).status).toBe(401);
    const user = await signUp('nosy@example.com');
    expect((await api().get('/api/admin/support').set('Authorization', bearer(user.token))).status).toBe(403);
    const admin = await api().post('/api/auth/email').send({ email: ADMIN, password: ADMIN_PASSWORD });
    const adminAuth = bearer(admin.body.token);
    const open = await api().get('/api/admin/support').set('Authorization', adminAuth);
    expect(open.body.data.map((m: { id: string }) => m.id)).toContain(id);
    expect(open.body.data.some((m: { email: string }) => m.email === 'bot@spam.com')).toBe(false);

    const closed = await api().post(`/api/admin/support/${id}/close`).set('Authorization', adminAuth);
    expect(closed.body.data).toMatchObject({ status: 'closed', closedBy: admin.body.user.id });
    const closedList = await api().get('/api/admin/support?status=closed').set('Authorization', adminAuth);
    expect(closedList.body.data.map((m: { id: string }) => m.id)).toContain(id);
    const reopened = await api().post(`/api/admin/support/${id}/reopen`).set('Authorization', adminAuth);
    expect(reopened.body.data.status).toBe('open');
  });

  it('validates the form and limits each address to 5 messages an hour', async () => {
    const bad = await api()
      .post('/api/support/messages')
      .send({ topic: 'x', name: '', email: 'no', message: 'hi' });
    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe('VALIDATION_FAILED');
    const send = () =>
      api().post('/api/support/messages').send({
        topic: 'bug',
        name: 'Rate',
        email: 'rate@example.com',
        message: 'La página de portfolio no carga.',
      });
    // The invalid one above counted too: 4 more pass, the 6th is refused.
    for (let i = 0; i < 4; i++) expect((await send()).status).toBe(201);
    const last = await send();
    expect(last.status).toBe(429);
    expect(last.body.code).toBe('RATE_LIMITED');
  });
});
