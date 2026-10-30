import fs from 'fs';
import os from 'os';
import path from 'path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config/env';
import { buildContainer, type Container } from '../../src/container';
import { InMemoryDocumentStore } from '../../src/infrastructure/persistence/DocumentStore';
import { InMemorySecretStore } from '../../src/infrastructure/stellar/SecretStore';
import { NullLogger } from '../../src/shared/logger';

/**
 * End-to-end checks of the HTTP surface with in-memory storage. Nothing here
 * touches Stellar: the flows exercised never reach Horizon or Soroban.
 */
const ADMIN = 'admin@fractachain.test';
const ADMIN_PASSWORD = 'admin-bootstrap-pass';

let container: Container;
let dataDir: string;

beforeAll(async () => {
  // Hidden directory on purpose: file serving must not trip over dot-segments of the data dir.
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), '.fc-api-'));
  const config = loadConfig({
    NODE_ENV: 'test',
    DATA_DIR: dataDir,
    AUTH_SECRET: 'a'.repeat(48),
    WALLET_PEPPER: 'test-wallet-pepper',
    ADMIN_EMAILS: ADMIN,
    ADMIN_BOOTSTRAP_PASSWORD: ADMIN_PASSWORD,
    DEMO_SEED_ACCOUNTS: 'false',
    CORS_ORIGINS: 'https://app.fractachain.test',
    SETTLEMENT_SWEEP_MS: '0',
    // Unroutable endpoints: any accidental network call fails fast instead of hitting testnet.
    STELLAR_HORIZON_URL: 'http://127.0.0.1:9',
    STELLAR_RPC_URL: 'http://127.0.0.1:9',
    STELLAR_FRIENDBOT_URL: 'http://127.0.0.1:9',
  });
  container = await buildContainer(config, new NullLogger(), {
    store: new InMemoryDocumentStore(),
    secrets: new InMemorySecretStore(),
  });
  await container.bootstrap.run();
});

afterAll(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
});

const api = () => request(container.app);

async function register(email: string, password = 'investor-pass-1') {
  const res = await api().post('/api/auth/email').send({ email, password });
  expect(res.status).toBe(200);
  return res.body as { token: string; expiresAt: string; user: { id: string; isAdmin: boolean } };
}

describe('auth', () => {
  it('registers, returns an expiring session and resolves /me', async () => {
    const session = await register('ana@example.com');
    expect(session.token.startsWith('fc2.')).toBe(true);
    expect(new Date(session.expiresAt).getTime()).toBeGreaterThan(Date.now());
    const me = await api().get('/api/auth/me').set('Authorization', `Bearer ${session.token}`);
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe('ana@example.com');
    expect(me.body.user).not.toHaveProperty('passwordHash');
    expect(me.body.user).not.toHaveProperty('secretKey');
  });

  it('rejects a wrong password with a generic message', async () => {
    await register('bob@example.com');
    const res = await api()
      .post('/api/auth/email')
      .send({ email: 'bob@example.com', password: 'not-the-password' });
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Email o contraseña incorrectos');
  });

  it('does not let anyone claim a password-less account (v1 takeover)', async () => {
    const accounts = container.services.accounts;
    const repo = (accounts as unknown as { accounts: { insert: (a: unknown) => void } }).accounts;
    repo.insert({
      id: 'usr_google_victim',
      email: 'victim@example.com',
      name: 'Victim',
      avatar: '',
      custodyMode: null,
      publicKey: '',
      kycStatus: 'APPROVED',
      holdings: [],
      trustlines: [],
      cashUsdc: 0,
      authProvider: 'firebase-google',
      createdAt: new Date().toISOString(),
      lastLoginAt: new Date().toISOString(),
    });
    const res = await api()
      .post('/api/auth/email')
      .send({ email: 'victim@example.com', password: 'attacker-pass' });
    expect(res.status).toBe(401);
  });

  it('reserves admin emails: only the bootstrap password opens them', async () => {
    const squat = await api().post('/api/auth/email').send({ email: ADMIN, password: 'squatter-pass' });
    expect(squat.status).toBe(401);
    const admin = await api().post('/api/auth/email').send({ email: ADMIN, password: ADMIN_PASSWORD });
    expect(admin.status).toBe(200);
    expect(admin.body.user.isAdmin).toBe(true);
  });

  it('refuses Google sign-in without server-side Firebase verification', async () => {
    const res = await api().post('/api/auth/firebase').send({ uid: 'x', email: ADMIN, idToken: 'forged' });
    expect(res.status).toBe(503);
    const legacy = await api().post('/api/auth/google').send({ email: ADMIN });
    expect(legacy.status).toBe(410);
  });

  it('revokes the session on logout', async () => {
    const { token } = await register('carla@example.com');
    const out = await api().post('/api/auth/logout').set('Authorization', `Bearer ${token}`);
    expect(out.body.revoked).toBe(true);
    const me = await api().get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(me.status).toBe(401);
  });

  it('validates input and reports field issues', async () => {
    const res = await api().post('/api/auth/email').send({ email: 'x@example.com', password: 'short' });
    expect(res.status).toBe(400);
    const bad = await api()
      .post('/api/auth/wallet')
      .set('Authorization', `Bearer ${(await register('dan@example.com')).token}`)
      .send({ mode: 'ROOT' });
    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe('VALIDATION_FAILED');
  });
});

describe('authorization', () => {
  it('guards admin routes', async () => {
    expect((await api().get('/api/listings')).status).toBe(401);
    const { token } = await register('eve@example.com');
    expect((await api().get('/api/listings').set('Authorization', `Bearer ${token}`)).status).toBe(403);
    expect((await api().get('/api/kyc').set('Authorization', `Bearer ${token}`)).status).toBe(403);
  });

  it('keeps KYC selfies private to the owner and admins', async () => {
    const owner = await register('frank@example.com');
    const custody = await api()
      .post('/api/auth/wallet')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ mode: 'SELF' });
    expect(custody.status).toBe(200);
    expect(custody.body.secretOnce).toMatch(/^S/);
    const png = Buffer.from(
      '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6300010000050001',
      'hex',
    );
    const kyc = await api()
      .post('/api/kyc/onboard')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        legalName: 'Frank SA',
        cuit: '20-12345678-9',
        selfieDataUrl: `data:image/png;base64,${png.toString('base64')}`,
      });
    expect(kyc.status).toBe(200);
    const url = `/api/kyc/selfie/${owner.user.id}`;
    expect((await api().get(url)).status).toBe(401);
    const stranger = await register('grace@example.com');
    expect((await api().get(url).set('Authorization', `Bearer ${stranger.token}`)).status).toBe(403);
    const mine = await api().get(url).set('Authorization', `Bearer ${owner.token}`);
    expect(mine.status).toBe(200);
    expect(mine.headers['content-type']).toBe('image/png');
    expect(mine.headers['cache-control']).toContain('no-store');
  });

  it('refuses disguised uploads (SVG/HTML claiming to be an image)', async () => {
    const { token } = await register('heidi@example.com');
    await api().post('/api/auth/wallet').set('Authorization', `Bearer ${token}`).send({ mode: 'SELF' });
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    ).toString('base64');
    const res = await api()
      .post('/api/kyc/onboard')
      .set('Authorization', `Bearer ${token}`)
      .send({ legalName: 'Heidi', cuit: '20-12345678-9', selfieDataUrl: `data:image/png;base64,${svg}` });
    expect(res.status).toBe(400);
  });

  it('requires a signature to link an existing wallet', async () => {
    const { token } = await register('ivan@example.com');
    const res = await api()
      .post('/api/auth/wallet')
      .set('Authorization', `Bearer ${token}`)
      .send({ mode: 'SELF', publicKey: 'GAGPWEIFYS54Y5WY3WJ6IWXK4YAPSNRVOEWEGBL7W3BKR6YL4VUYE653' });
    expect(res.status).toBe(400);
  });
});

describe('http hardening', () => {
  it('sends security headers and hides the framework', async () => {
    const res = await api().get('/health');
    expect(res.status).toBe(200);
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toContain("default-src 'none'");
    expect(res.headers['x-request-id']).toBeDefined();
  });

  it('only reflects allowlisted CORS origins', async () => {
    const allowed = await api().get('/health').set('Origin', 'https://app.fractachain.test');
    expect(allowed.headers['access-control-allow-origin']).toBe('https://app.fractachain.test');
    const evil = await api().get('/health').set('Origin', 'https://evil.example');
    expect(evil.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('answers unknown routes and malformed JSON with the error envelope', async () => {
    const missing = await api().get('/api/nope');
    expect(missing.status).toBe(404);
    expect(missing.body.success).toBe(false);
    const broken = await api()
      .post('/api/auth/email')
      .set('Content-Type', 'application/json')
      .send('{"email":');
    expect(broken.status).toBe(400);
    expect(broken.body.message).toBe('JSON inválido');
  });

  it('rejects anonymous KYC uploads before buffering the body', async () => {
    const res = await api()
      .post('/api/kyc/onboard')
      .send({ legalName: 'x', cuit: '20123456789', selfieDataUrl: 'x'.repeat(1_000_000) });
    expect(res.status).toBe(401);
  });

  it('caps body size outside the KYC upload', async () => {
    const res = await api()
      .post('/api/auth/email')
      .send({ email: 'x@example.com', password: 'p'.repeat(200_000) });
    expect(res.status).toBe(413);
  });
});

describe('sandbox market', () => {
  it('lists the seeded Merval catalog and proof of reserve', async () => {
    const stocks = await api().get('/api/custody/stocks');
    expect(stocks.status).toBe(200);
    expect(stocks.body.data.length).toBeGreaterThan(0);
    const por = await api().get('/api/custody/por');
    expect(por.body.data.verified).toBe(true);
  });
});

describe('offering activity', () => {
  it('reports anonymous daily contributions and the investor count', async () => {
    const { listings, accounts } = container.services;
    const listing = listings.create({
      legalName: 'Agropecuaria Activity S.A.',
      tradeName: 'Activity',
      cuit: '30681920149',
      jurisdiction: 'Pergamino, Buenos Aires',
      sector: 'Soja',
      ticker: 'ACTV',
      tokenTicker: 'ACTV',
      isin: 'ARACTV000001',
      authorizedShares: 50000,
      sharesToTokenize: 4000,
      pricePerShareUsdc: 5,
      cajaSubaccount: 'CV-1',
      custodianCuit: '30700000000',
      cnvRecordId: 'CNV-1',
      bymaRequestId: 'BYMA-1',
      legalTermsUri: 'https://example.com/terms',
      estatutoHash: 'hash',
      auditor: 'Auditor',
      issuerPublicKey: '',
      proceedsWallet: 'GDUA6DQZJXBPTAQANQXEKXV3VXCPUIP5XQEHDAKJLRAVTXK35ZX2YORW',
      paymentKind: 'USDC',
      offeringSoftCapUsdc: 1000,
      offeringHardCapUsdc: 20000,
      offeringDays: 21,
      tnaUsd: 12,
      useOfProceeds: 'Campaña',
      minInvestmentUsdc: 10,
    });
    const stored = listings.require(listing.id);
    stored.tokensMinted = 4000;
    listings.markOpen(listing.id);

    for (const email of ['ivy@example.com', 'jon@example.com']) {
      const { user } = await register(email);
      const account = accounts.require(user.id);
      account.kycStatus = 'APPROVED';
      account.custodyMode = 'CUSTODIAL';
      account.publicKey = 'GDUA6DQZJXBPTAQANQXEKXV3VXCPUIP5XQEHDAKJLRAVTXK35ZX2YORW';
      accounts.save(account);
      accounts.creditCash(user.id, 1000);
      listings.contributeSandbox(listing.id, 100, user.id);
    }

    const res = await api().get(`/api/listings/${listing.id}/activity`);
    expect(res.status).toBe(200);
    expect(res.body.data.investors).toBe(2);
    expect(res.body.data.undatedUsdc).toBe(0);
    expect(res.body.data.daily).toEqual([{ date: new Date().toISOString().slice(0, 10), usdc: 200 }]);
    expect(JSON.stringify(res.body)).not.toMatch(/@example\.com/);
  });
});
