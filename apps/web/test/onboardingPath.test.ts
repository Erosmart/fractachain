import { describe, expect, it } from 'vitest';
import {
  afterAuthPath,
  investorReadyPath,
  nextOnboardingPath,
  safeNextPath,
} from '@/core/auth/onboardingPath';
import { RETURN_TO_KEY, returnTo } from '@/core/auth/returnTo';

/** In-memory stand-in for sessionStorage. */
function memoryStore() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

describe('returnTo', () => {
  it('keeps a same-site path to come back to after verifying, and clears it', () => {
    const s = memoryStore();
    returnTo.set('/market/IPO-1', s);
    expect(returnTo.peek(s)).toBe('/market/IPO-1');
    returnTo.clear(s);
    expect(returnTo.peek(s)).toBeNull();
  });

  it('never stores or returns off-site targets', () => {
    const s = memoryStore();
    returnTo.set('https://evil.example', s);
    expect(returnTo.peek(s)).toBeNull();
    s.setItem(RETURN_TO_KEY, '//evil.example');
    expect(returnTo.peek(s)).toBeNull();
  });
});

const investor = { isAdmin: false, custodyMode: 'CUSTODIAL', kycStatus: 'APPROVED' } as const;

describe('nextOnboardingPath', () => {
  it('sends anonymous visitors to login', () => {
    expect(nextOnboardingPath(null)).toBe('/login');
  });

  it('walks investors through wallet → KYC → pending', () => {
    expect(nextOnboardingPath({ ...investor, custodyMode: null })).toBe('/onboarding/wallet');
    expect(nextOnboardingPath({ ...investor, kycStatus: 'UNREGISTERED' })).toBe('/onboarding/kyc');
    expect(nextOnboardingPath({ ...investor, kycStatus: 'PENDING' })).toBe('/onboarding/pending');
    expect(nextOnboardingPath({ ...investor, kycStatus: 'REJECTED' })).toBe('/onboarding/pending');
    expect(nextOnboardingPath(investor)).toBe('/dashboard');
  });

  it('never gates admins', () => {
    expect(nextOnboardingPath({ isAdmin: true, custodyMode: null, kycStatus: 'UNREGISTERED' })).toBe(
      '/dashboard',
    );
  });
});

describe('investorReadyPath', () => {
  it('names the verification step still owed, or null when ready', () => {
    expect(investorReadyPath({ ...investor, custodyMode: null })).toBe('/onboarding/wallet');
    expect(investorReadyPath({ ...investor, kycStatus: 'UNREGISTERED' })).toBe('/onboarding/kyc');
    expect(investorReadyPath({ ...investor, kycStatus: 'PENDING' })).toBe('/onboarding/pending');
    expect(investorReadyPath(investor)).toBeNull();
    expect(investorReadyPath({ isAdmin: true, custodyMode: null, kycStatus: 'UNREGISTERED' })).toBeNull();
  });
});

describe('afterAuthPath', () => {
  it('honours ?next without waiting for wallet or KYC (asked for when investing)', () => {
    expect(afterAuthPath(investor, '/orderbook')).toBe('/orderbook');
    expect(afterAuthPath({ ...investor, kycStatus: 'PENDING' }, '/market/IPO-1')).toBe('/market/IPO-1');
    expect(afterAuthPath({ ...investor, custodyMode: null, kycStatus: 'UNREGISTERED' })).toBe('/dashboard');
  });

  it('defaults admins to the KYC queue', () => {
    expect(afterAuthPath({ ...investor, isAdmin: true })).toBe('/admin/kyc');
    expect(afterAuthPath({ ...investor, isAdmin: true }, '/admin/issuance')).toBe('/admin/issuance');
  });

  it('ignores off-site ?next targets (open redirect)', () => {
    expect(afterAuthPath({ ...investor, isAdmin: true }, 'https://evil.example')).toBe('/admin/kyc');
    expect(afterAuthPath({ ...investor, isAdmin: true }, '//evil.example')).toBe('/admin/kyc');
    expect(safeNextPath('/\\evil.example')).toBeNull();
    expect(safeNextPath('/market/IPO-1?x=1')).toBe('/market/IPO-1?x=1');
  });
});
