import { describe, expect, it, vi } from 'vitest';
import type { VerificationView } from '@fractachain/shared';
import type { AuthApi } from '@/core/api/AuthApi';
import { KycApi } from '@/core/api/KycApi';
import { MemorySessionCache } from '@/core/auth/SessionCache';
import { SessionStore } from '@/core/auth/SessionStore';
import { normalizeUser } from '@/core/auth/SessionUser';
import type { IHttpClient } from '@/core/http/HttpClient';
import { OnboardingService } from '@/core/onboarding/OnboardingService';
import {
  isTrustedVerificationUrl,
  pollDelay,
  presentStage,
  stepperIndex,
  verificationStage,
} from '@/core/onboarding/verification';
import { translate } from '@/core/i18n/translate';
import type { UsdcFundingService } from '@/core/wallet/UsdcFundingService';
import type { IWalletSigner } from '@/core/wallet/WalletSigner';

const session = (status: NonNullable<VerificationView['session']>['status'], extra = {}) => ({
  status,
  canRestart: false,
  updatedAt: '2026-10-30T12:00:00.000Z',
  ...extra,
});

describe('verificationStage', () => {
  it('maps every Didit status to a stage of the status table', () => {
    const didit = (s: Parameters<typeof session>[0], kycStatus: VerificationView['kycStatus'] = 'PENDING') =>
      verificationStage({ provider: 'didit', kycStatus, session: session(s) });
    expect(didit('Not Started')).toBe('not_started');
    expect(didit('In Progress')).toBe('in_progress');
    expect(didit('In Review')).toBe('in_review');
    expect(didit('Resubmitted')).toBe('needs_changes');
    expect(didit('Awaiting User')).toBe('needs_changes');
    expect(didit('Declined', 'REJECTED')).toBe('rejected');
    expect(didit('Abandoned')).toBe('expired');
    expect(didit('Expired')).toBe('expired');
    expect(didit('Kyc Expired')).toBe('expired');
    // Provider says Approved but the API hasn't applied it yet: still processing, never "approved".
    expect(didit('Approved')).toBe('in_review');
  });

  it('trusts the account status first', () => {
    expect(
      verificationStage({ provider: 'didit', kycStatus: 'APPROVED', session: session('In Review') }),
    ).toBe('approved');
    expect(
      verificationStage({ provider: 'didit', kycStatus: 'REVOKED', session: session('Kyc Expired') }),
    ).toBe('revoked');
    expect(verificationStage({ provider: 'didit', kycStatus: 'UNREGISTERED' })).toBe('needs_data');
    expect(verificationStage({ provider: 'didit', kycStatus: 'PENDING' })).toBe('not_started');
  });

  it('covers the manual flow (compliance review, selfie)', () => {
    expect(verificationStage({ provider: 'manual', kycStatus: 'PENDING' })).toBe('manual_review');
    expect(verificationStage({ provider: 'manual', kycStatus: 'REJECTED' })).toBe('rejected');
    expect(presentStage({ provider: 'manual', kycStatus: 'REJECTED' }).action).toBe('form');
  });
});

describe('presentStage', () => {
  it('offers exactly one action per state', () => {
    const p = (
      s: Parameters<typeof session>[0],
      kycStatus: VerificationView['kycStatus'] = 'PENDING',
      extra = {},
    ) => presentStage({ provider: 'didit', kycStatus, session: session(s, extra) });
    expect(p('Not Started').action).toBe('verify');
    expect(p('In Progress')).toMatchObject({ action: 'verify', poll: true, tone: 'sky' });
    expect(p('In Review')).toMatchObject({ action: 'none', poll: true, tone: 'warn' });
    expect(p('Resubmitted')).toMatchObject({ action: 'verify', tone: 'peach' });
    expect(p('Expired')).toMatchObject({ action: 'verify', poll: false });
    expect(p('Declined', 'REJECTED', { canRestart: true }).action).toBe('verify');
    expect(p('Declined', 'REJECTED', { canRestart: false }).action).toBe('none');
    expect(p('Approved', 'APPROVED')).toMatchObject({ action: 'invest', tone: 'good', poll: false });
  });

  it('has copy for every stage in both languages', () => {
    const stages = ['Not Started', 'In Progress', 'In Review', 'Resubmitted', 'Declined', 'Expired'] as const;
    for (const s of stages) {
      const { copy } = presentStage({ provider: 'didit', kycStatus: 'PENDING', session: session(s) });
      for (const locale of ['es', 'en'] as const) {
        expect(translate(locale, copy.chip)).not.toBe(copy.chip);
        expect(translate(locale, copy.title)).not.toBe(copy.title);
        if (copy.cta) expect(translate(locale, copy.cta)).not.toBe('');
      }
    }
  });
});

describe('stepperIndex and polling', () => {
  it('walks Cuenta → Wallet → Datos → Identidad → Revisión', () => {
    expect(stepperIndex({ custodyMode: null, stage: 'needs_data' })).toBe(1);
    expect(stepperIndex({ custodyMode: 'CUSTODIAL', stage: 'needs_data' })).toBe(2);
    expect(stepperIndex({ custodyMode: 'SELF', stage: 'in_progress' })).toBe(3);
    expect(stepperIndex({ custodyMode: 'SELF', stage: 'in_review' })).toBe(4);
    expect(stepperIndex({ custodyMode: 'SELF', stage: 'approved' })).toBe(5);
  });

  it('backs off and caps the re-reads', () => {
    expect([0, 1, 2, 3, 4, 9].map(pollDelay)).toEqual([3000, 6000, 12000, 24000, 30000, 30000]);
  });
});

describe('isTrustedVerificationUrl', () => {
  it('only lets the browser go to Didit over https', () => {
    expect(isTrustedVerificationUrl('https://verify.didit.me/session/abc')).toBe(true);
    expect(isTrustedVerificationUrl('https://didit.me/x')).toBe(true);
    expect(isTrustedVerificationUrl('http://verify.didit.me/session/abc')).toBe(false);
    expect(isTrustedVerificationUrl('https://verify.didit.me.evil.com/session')).toBe(false);
    expect(isTrustedVerificationUrl('https://evildidit.me/session')).toBe(false);
    expect(isTrustedVerificationUrl('https://user:pw@verify.didit.me/')).toBe(false);
    expect(isTrustedVerificationUrl('javascript:alert(1)')).toBe(false);
    expect(isTrustedVerificationUrl('/onboarding/kyc')).toBe(false);
  });
});

/** Fake transport that records requests and answers by path. */
function fakeHttp(routes: Record<string, unknown>) {
  const calls: { path: string; method: string; body?: unknown }[] = [];
  const answer = (path: string) => {
    const key = Object.keys(routes).find((k) => path.startsWith(k));
    if (!key) throw new Error(`unexpected ${path}`);
    return routes[key];
  };
  const http: IHttpClient = {
    send: vi.fn(async (path, opts = {}) => {
      calls.push({ path, method: opts.method ?? 'GET', body: opts.body });
      return answer(path) as never;
    }),
    get: vi.fn(async (path) => {
      calls.push({ path, method: 'GET' });
      return (answer(path) as { data: unknown }).data as never;
    }),
    post: vi.fn(async (path, body) => {
      calls.push({ path, method: 'POST', body });
      return (answer(path) as { data: unknown }).data as never;
    }),
    blob: vi.fn(),
    url: (p: string) => p,
  };
  return { http, calls };
}

function onboardingWith(
  routes: Record<string, unknown>,
  me = vi.fn(async () => ({ id: 'u1', kycStatus: 'APPROVED' })),
) {
  const { http, calls } = fakeHttp(routes);
  const store = new SessionStore(new MemorySessionCache());
  store.hydrate();
  store.setSession(
    normalizeUser({ id: 'u1', email: 'a@b.co', custodyMode: 'CUSTODIAL', kycStatus: 'PENDING' }),
  );
  const service = new OnboardingService(
    { me } as unknown as AuthApi,
    new KycApi(http),
    store,
    {} as IWalletSigner,
    {} as UsdcFundingService,
    (key) => translate('es', key),
  );
  return { service, calls, store, me };
}

describe('OnboardingService · Didit', () => {
  it('reads the provider once per page', async () => {
    const { service, calls } = onboardingWith({
      '/api/kyc/provider': { success: true, provider: 'didit', selfieRequired: false },
    });
    expect(await service.kycProvider()).toEqual({ provider: 'didit', selfieRequired: false });
    await service.kycProvider();
    expect(calls.filter((c) => c.path === '/api/kyc/provider')).toHaveLength(1);
  });

  it('sends the data, then opens the hosted session in the investor language', async () => {
    const { service, calls } = onboardingWith({
      '/api/kyc/onboard': {
        success: true,
        user: { id: 'u1', kycStatus: 'PENDING', custodyMode: 'CUSTODIAL' },
      },
      '/api/kyc/verification': { success: true, url: 'https://verify.didit.me/session/tok', sessionId: 's1' },
    });
    const url = await service.submitKycAndVerify({ legalName: 'Ana', cuit: '27123456785' }, 'en');
    expect(url).toBe('https://verify.didit.me/session/tok');
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      'POST /api/kyc/onboard',
      'POST /api/kyc/verification',
    ]);
    expect(calls[1].body).toEqual({ language: 'en' });
  });

  it('refuses to redirect anywhere but Didit', async () => {
    const { service } = onboardingWith({
      '/api/kyc/verification': { success: true, url: 'https://phish.example/session', sessionId: 's1' },
    });
    await expect(service.startVerification('es')).rejects.toThrow(/Didit/);
  });

  it('syncs through the API and refreshes the user when the decision moved', async () => {
    const view: VerificationView = { provider: 'didit', kycStatus: 'APPROVED', session: session('Approved') };
    const { service, store, me, calls } = onboardingWith({
      '/api/kyc/verification/sync': { success: true, data: view },
    });
    expect(await service.syncVerification()).toEqual(view);
    expect(calls[0]).toMatchObject({ method: 'POST', path: '/api/kyc/verification/sync' });
    expect(me).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot().user?.kycStatus).toBe('APPROVED');
  });

  it("doesn't refresh the user when nothing changed", async () => {
    const view: VerificationView = { provider: 'didit', kycStatus: 'PENDING', session: session('In Review') };
    const { service, me } = onboardingWith({ '/api/kyc/verification/sync': { success: true, data: view } });
    await service.syncVerification();
    expect(me).not.toHaveBeenCalled();
  });
});
