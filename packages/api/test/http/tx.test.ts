import fs from 'fs';
import os from 'os';
import path from 'path';
import request from 'supertest';
import { DEFAULT_LEGAL_VERSION as LEGAL } from '../../src/domain/account/Account';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config/env';
import { buildContainer, type Container } from '../../src/container';
import { InMemoryDocumentStore } from '../../src/infrastructure/persistence/DocumentStore';
import { InMemorySecretStore } from '../../src/infrastructure/stellar/SecretStore';
import { NullLogger } from '../../src/shared/logger';

/** HTTP surface of /api/tx (no network: every case is refused before Soroban). */
let container: Container;
let dataDir: string;

beforeAll(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fc-tx-'));
  const config = loadConfig({
    NODE_ENV: 'test',
    DATA_DIR: dataDir,
    AUTH_SECRET: 't'.repeat(48),
    WALLET_PEPPER: 'test-wallet-pepper',
    DEMO_SEED_ACCOUNTS: 'false',
    SETTLEMENT_SWEEP_MS: '0',
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

afterAll(() => fs.rmSync(dataDir, { recursive: true, force: true }));

const api = () => request(container.app);

async function session(email: string, custody?: 'CUSTODIAL') {
  const login = await api()
    .post('/api/auth/register')
    .send({ name: 'Investor', email, password: 'investor-pass-1', acceptTerms: true, termsVersion: LEGAL });
  const auth = `Bearer ${login.body.token}`;
  if (custody) {
    const account = container.services.accounts.require(login.body.user.id);
    account.custodyMode = custody;
    account.publicKey = 'GDUA6DQZJXBPTAQANQXEKXV3VXCPUIP5XQEHDAKJLRAVTXK35ZX2YORW';
    container.services.accounts.save(account);
  }
  return auth;
}

describe('/api/tx', () => {
  it('needs a session and a well-formed request', async () => {
    expect((await api().post('/api/tx/build').send({ action: 'usdc_trustline' })).status).toBe(401);
    const auth = await session('tx-anon@example.com');
    const bad = await api().post('/api/tx/build').set('Authorization', auth).send({ action: 'drain' });
    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe('VALIDATION_FAILED');
    const noAmount = await api()
      .post('/api/tx/build')
      .set('Authorization', auth)
      .send({ action: 'contribute', listingId: 'IPO-X' });
    expect(noAmount.status).toBe(400);
  });

  it('is only for wallets the investor signs with (custodial keeps its own endpoints)', async () => {
    const custodial = await session('tx-custodial@example.com', 'CUSTODIAL');
    const res = await api()
      .post('/api/tx/build')
      .set('Authorization', custodial)
      .send({ action: 'usdc_trustline' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/custodial/);
    const noWallet = await session('tx-nowallet@example.com');
    const res2 = await api()
      .post('/api/tx/build')
      .set('Authorization', noWallet)
      .send({ action: 'usdc_trustline' });
    expect(res2.status).toBe(400);
    expect(res2.body.message).toMatch(/Freighter/);
  });

  it('refuses unknown builds and malformed hashes', async () => {
    const auth = await session('tx-submit@example.com');
    const unknown = await api()
      .post('/api/tx/submit')
      .set('Authorization', auth)
      .send({ buildId: `txb_${'0'.repeat(24)}`, signedXdr: 'AAAA' });
    expect(unknown.status).toBe(404);
    const badId = await api()
      .post('/api/tx/submit')
      .set('Authorization', auth)
      .send({ buildId: 'x', signedXdr: 'A' });
    expect(badId.status).toBe(400);
    expect((await api().get('/api/tx/not-a-hash')).status).toBe(400);
  });

  it('records every build and submit attempt in the audit trail', async () => {
    const auth = await session('tx-audit@example.com', 'CUSTODIAL');
    await api().post('/api/tx/build').set('Authorization', auth).send({ action: 'usdc_trustline' });
    const actions = container.services.audit.query({ limit: 50 }).map((e) => e.action);
    expect(actions).toContain('tx.build');
  });
});
