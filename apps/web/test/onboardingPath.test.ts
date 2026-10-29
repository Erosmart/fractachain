import { describe, expect, it } from 'vitest';
import { afterAuthPath, nextOnboardingPath, safeNextPath } from '@/core/auth/onboardingPath';

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
    expect(nextOnboardingPath({ isAdmin: true, custodyMode: null, kycStatus: 'UNREGISTERED' })).toBe('/dashboard');
  });
});

describe('afterAuthPath', () => {
  it('honours ?next only once onboarding is complete', () => {
    expect(afterAuthPath(investor, '/orderbook')).toBe('/orderbook');
    expect(afterAuthPath({ ...investor, kycStatus: 'PENDING' }, '/orderbook')).toBe('/onboarding/pending');
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
