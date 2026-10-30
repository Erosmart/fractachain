import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import request from 'supertest';
import { DEFAULT_LEGAL_VERSION as LEGAL } from '../../src/domain/account/Account';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config/env';
import { buildContainer, type Container } from '../../src/container';
import type {
  IIdentityVerificationProvider,
  ProviderDecision,
  ProviderSession,
  ProviderSessionStatus,
  StartVerificationInput,
} from '../../src/domain/kyc/IdentityVerification';
import { canonicalJson } from '../../src/infrastructure/kyc/DiditClient';
import { InMemoryDocumentStore } from '../../src/infrastructure/persistence/DocumentStore';
import { InMemorySecretStore } from '../../src/infrastructure/stellar/SecretStore';
import { NullLogger } from '../../src/shared/logger';

/** Stands in for Didit: sessions are created locally and decided by the test. */
class FakeDidit implements IIdentityVerificationProvider {
  readonly name = 'didit' as const;
  readonly started: StartVerificationInput[] = [];
  private readonly sessions = new Map<string, { accountId: string; status: ProviderSessionStatus }>();
  private seq = 0;

  async startSession(input: StartVerificationInput): Promise<ProviderSession> {
    this.started.push(input);
    const sessionId = `11111111-2222-3333-4444-${String(++this.seq).padStart(12, '0')}`;
    this.sessions.set(sessionId, { accountId: input.accountId, status: 'Not Started' });
    return { sessionId, url: `https://verify.didit.me/session/tok${this.seq}`, status: 'Not Started' };
  }

  async fetchDecision(sessionId: string): Promise<ProviderDecision> {
    const s = this.sessions.get(sessionId);
    if (!s) throw new Error('unknown session');
    return {
      sessionId,
      status: s.status,
      vendorData: s.accountId,
      identity: {
        fullName: 'MARÍA GÓMEZ',
        documentType: 'Identity Card',
        documentNumberLast4: '5678',
        issuingState: 'ARG',
      },
      checks: {
        document: s.status,
        liveness: 'Approved',
        faceMatch: 'Approved',
        aml: 'Approved',
        amlHits: 0,
      },
    };
  }

  decide(sessionId: string, status: ProviderSessionStatus) {
    this.sessions.get(sessionId)!.status = status;
  }
}

const SECRET = 'didit-webhook-secret';
const didit = new FakeDidit();
let container: Container;
let dataDir: string;

beforeAll(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fc-didit-'));
  const config = loadConfig({
    NODE_ENV: 'test',
    DATA_DIR: dataDir,
    AUTH_SECRET: 'd'.repeat(48),
    WALLET_PEPPER: 'test-wallet-pepper',
    APP_URL: 'https://app.fractachain.test',
    DEMO_SEED_ACCOUNTS: 'false',
    SETTLEMENT_SWEEP_MS: '0',
    DIDIT_API_KEY: 'test-key',
    DIDIT_WORKFLOW_ID: 'wf-test',
    DIDIT_WEBHOOK_SECRET: SECRET,
    STELLAR_HORIZON_URL: 'http://127.0.0.1:9',
    STELLAR_RPC_URL: 'http://127.0.0.1:9',
    STELLAR_FRIENDBOT_URL: 'http://127.0.0.1:9',
  });
  container = await buildContainer(config, new NullLogger(), {
    store: new InMemoryDocumentStore(),
    secrets: new InMemorySecretStore(),
    identityProvider: didit,
  });
  await container.bootstrap.run();
});

afterAll(() => fs.rmSync(dataDir, { recursive: true, force: true }));

const api = () => request(container.app);

async function investor(email: string) {
  const login = await api()
    .post('/api/auth/register')
    .send({ name: 'Investor', email, password: 'investor-pass-1', acceptTerms: true, termsVersion: LEGAL });
  const auth = `Bearer ${login.body.token}`;
  await api().post('/api/auth/wallet').set('Authorization', auth).send({ mode: 'SELF' });
  const onboard = await api()
    .post('/api/kyc/onboard')
    .set('Authorization', auth)
    .send({ legalName: 'Maria', cuit: '27123456785' });
  expect(onboard.status).toBe(200);
  return { auth, id: login.body.user.id as string };
}

function signedWebhook(body: object, { secret = SECRET, timestamp = Math.floor(Date.now() / 1000) } = {}) {
  const sig = crypto.createHmac('sha256', secret).update(canonicalJson(body)).digest('hex');
  return api()
    .post('/api/kyc/didit/webhook')
    .set('X-Timestamp', String(timestamp))
    .set('X-Signature-V2', sig)
    .send(body);
}

describe('KYC with Didit', () => {
  it('announces the hosted flow and skips the selfie', async () => {
    const provider = await api().get('/api/kyc/provider');
    expect(provider.body).toMatchObject({ provider: 'didit', selfieRequired: false });
    const { auth } = await investor('maria@example.com');
    const me = await api().get('/api/auth/me').set('Authorization', auth);
    // A real provider decides: no auto-approval on submit.
    expect(me.body.user.kycStatus).toBe('PENDING');
  });

  it('starts a session, resumes it, and applies the decision on sync', async () => {
    const { auth, id } = await investor('ana@example.com');
    const start = await api()
      .post('/api/kyc/verification')
      .set('Authorization', auth)
      .send({ language: 'es' });
    expect(start.status).toBe(200);
    expect(start.body.url).toMatch(/^https:\/\/verify\.didit\.me\/session\//);
    expect(didit.started.at(-1)).toMatchObject({
      accountId: id,
      callbackUrl: 'https://app.fractachain.test/onboarding/kyc/callback',
      language: 'es',
    });
    const again = await api().post('/api/kyc/verification').set('Authorization', auth).send({});
    expect(again.body.sessionId).toBe(start.body.sessionId);

    didit.decide(start.body.sessionId, 'Approved');
    const sync = await api().post('/api/kyc/verification/sync').set('Authorization', auth);
    expect(sync.status).toBe(200);
    expect(sync.body.data).toMatchObject({
      kycStatus: 'APPROVED',
      session: { status: 'Approved', canRestart: false },
    });
    expect(sync.body.data.session.resumeUrl).toBeUndefined();
    const me = await api().get('/api/auth/me').set('Authorization', auth);
    expect(me.body.user.kycStatus).toBe('APPROVED');
    expect(me.body.user.legalName ?? me.body.user.name).toBe('MARÍA GÓMEZ');
    // Already verified: no second session.
    expect((await api().post('/api/kyc/verification').set('Authorization', auth).send({})).status).toBe(409);
  });

  it('authenticates webhooks, ignores replays and freezes an approved investor on a later decline', async () => {
    const { auth, id } = await investor('bea@example.com');
    const { sessionId } = (await api().post('/api/kyc/verification').set('Authorization', auth).send({}))
      .body;
    didit.decide(sessionId, 'Approved');
    const event = {
      event_id: 'evt-1',
      webhook_type: 'status.updated',
      session_id: sessionId,
      vendor_data: id,
      status: 'Approved',
      timestamp: 1730000000,
    };

    expect((await signedWebhook(event, { secret: 'wrong' })).status).toBe(401);
    expect((await signedWebhook(event, { timestamp: Math.floor(Date.now() / 1000) - 3600 })).status).toBe(
      401,
    );
    const unsigned = await api().post('/api/kyc/didit/webhook').send(event);
    expect(unsigned.status).toBe(401);

    const ok = await signedWebhook(event);
    expect(ok.status).toBe(200);
    expect(ok.body.applied).toBe(true);
    expect((await signedWebhook(event)).body.applied).toBe(false);
    expect((await api().get('/api/auth/me').set('Authorization', auth)).body.user.kycStatus).toBe('APPROVED');

    didit.decide(sessionId, 'Declined');
    await signedWebhook({ ...event, event_id: 'evt-2', status: 'Declined' });
    expect((await api().get('/api/auth/me').set('Authorization', auth)).body.user.kycStatus).toBe('REVOKED');
  });

  it('never lets a webhook for one account touch another', async () => {
    const victim = await investor('carla@example.com');
    const { sessionId } = (
      await api().post('/api/kyc/verification').set('Authorization', victim.auth).send({})
    ).body;
    didit.decide(sessionId, 'Declined');
    const forged = await signedWebhook({
      event_id: 'evt-3',
      session_id: sessionId,
      vendor_data: 'someone-else',
      status: 'Declined',
    });
    expect(forged.body.applied).toBe(false);
    const unknown = await signedWebhook({
      event_id: 'evt-4',
      session_id: 'not-a-session',
      status: 'Approved',
    });
    expect(unknown.status).toBe(200);
    expect(unknown.body.applied).toBe(false);
    expect((await api().get('/api/auth/me').set('Authorization', victim.auth)).body.user.kycStatus).toBe(
      'PENDING',
    );
  });

  it('lets a declined investor restart and shows the provider summary to compliance only', async () => {
    const { auth, id } = await investor('dora@example.com');
    const first = (await api().post('/api/kyc/verification').set('Authorization', auth).send({})).body;
    didit.decide(first.sessionId, 'Declined');
    const view = (await api().post('/api/kyc/verification/sync').set('Authorization', auth)).body.data;
    expect(view).toMatchObject({ kycStatus: 'REJECTED', session: { status: 'Declined', canRestart: true } });
    expect(view.reason).toBe('Didit no pudo verificar tu identidad.');
    const second = (await api().post('/api/kyc/verification').set('Authorization', auth).send({})).body;
    expect(second.sessionId).not.toBe(first.sessionId);
    expect((await api().get('/api/auth/me').set('Authorization', auth)).body.user.kycStatus).toBe('PENDING');

    // A webhook about the superseded session changes nothing.
    didit.decide(first.sessionId, 'Approved');
    expect(
      (await signedWebhook({ event_id: 'evt-5', session_id: first.sessionId, vendor_data: id })).body.applied,
    ).toBe(false);
    expect((await api().get('/api/auth/me').set('Authorization', auth)).body.user.kycStatus).toBe('PENDING');

    const row = container.services.kyc.queue().find((r) => r.userId === id);
    expect(row?.verification).toMatchObject({ provider: 'didit', status: 'Not Started' });
    expect(JSON.stringify(row)).not.toContain('verify.didit.me');
  });
});
