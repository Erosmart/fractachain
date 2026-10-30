import { describe, expect, it } from 'vitest';
import type { SupportMessage } from '@fractachain/shared';
import { afterAuthPath, needsTerms, nextOnboardingPath, termsPath } from '@/core/auth/onboardingPath';
import { closeProof, closeRequest, confirmMatches, exportFileName } from '@/features/account/privacy';
import { replyHref, sortInbox } from '@/features/admin/support/model';
import { firstInvalid, passwordChecks, SIGNUP_FIELDS, validateSignup } from '@/features/auth/model';
import { toRequest, topicFromParam, validateContact, type ContactForm } from '@/features/support/model';

const investor = {
  isAdmin: false,
  custodyMode: null,
  kycStatus: 'UNREGISTERED' as const,
};

describe('onboarding: terms come first', () => {
  it('sends accounts without the current terms to the terms step before anything else', () => {
    expect(nextOnboardingPath({ ...investor, termsAccepted: false })).toBe('/onboarding/terms');
    expect(
      nextOnboardingPath({ ...investor, custodyMode: 'SELF', kycStatus: 'APPROVED', termsAccepted: false }),
    ).toBe('/onboarding/terms');
    expect(nextOnboardingPath({ ...investor, termsAccepted: true })).toBe('/onboarding/wallet');
  });

  it('treats a missing flag (older API) as accepted and never gates admins', () => {
    expect(needsTerms({})).toBe(false);
    expect(nextOnboardingPath(investor)).toBe('/onboarding/wallet');
    expect(nextOnboardingPath({ ...investor, isAdmin: true, termsAccepted: false })).toBe('/dashboard');
  });

  it('keeps ?next= through the terms step, only for same-site paths', () => {
    const user = {
      ...investor,
      custodyMode: 'SELF' as const,
      kycStatus: 'APPROVED' as const,
      termsAccepted: false,
    };
    expect(afterAuthPath(user, '/market/IPO-1')).toBe('/onboarding/terms?next=%2Fmarket%2FIPO-1');
    expect(afterAuthPath(user, 'https://evil.example')).toBe('/onboarding/terms');
    expect(termsPath('//evil.example')).toBe('/onboarding/terms');
    expect(termsPath('/onboarding/terms')).toBe('/onboarding/terms');
  });
});

describe('sign-up validation', () => {
  const ok = {
    name: 'María Gómez',
    email: 'maria@example.com',
    password: 'una-clave-larga',
    confirm: 'una-clave-larga',
    acceptTerms: true,
    acceptRisks: true,
  };

  it('accepts a complete form', () => {
    expect(validateSignup(ok)).toEqual({});
  });

  it('reports each problem and the first field to focus', () => {
    const errors = validateSignup({ ...ok, email: 'maria@', password: 'corta', acceptTerms: false });
    expect(errors).toEqual({ email: 'email', password: 'password', acceptTerms: 'terms' });
    expect(firstInvalid(SIGNUP_FIELDS, errors)).toBe('email');
    expect(validateSignup({ ...ok, confirm: 'otra-clave-larga' })).toEqual({ confirm: 'mismatch' });
    expect(validateSignup({ ...ok, acceptRisks: false })).toEqual({ acceptRisks: 'risks' });
  });

  it('drives the live password checklist', () => {
    expect(passwordChecks('', '')).toEqual({ length: false, match: false });
    expect(passwordChecks('12345678', '12345678')).toEqual({ length: true, match: true });
  });
});

describe('contact form', () => {
  const base: ContactForm = {
    topic: 'general',
    name: 'Ana',
    email: 'ana@example.com',
    message: 'Quiero saber cómo funciona.',
    company: '',
    cuit: '',
    amount: '',
    website: '',
  };

  it('maps shareable ?tema= values to topics', () => {
    expect(topicFromParam('emisor')).toBe('issuer');
    expect(topicFromParam('privacidad')).toBe('privacy');
    expect(topicFromParam('KYC')).toBe('kyc');
    expect(topicFromParam('nope')).toBe('general');
    expect(topicFromParam(null)).toBe('general');
  });

  it('asks issuers for the company and checks CUIT and amount when given', () => {
    expect(validateContact(base)).toEqual({});
    expect(validateContact({ ...base, message: 'corto' })).toEqual({ message: 'message' });
    expect(validateContact({ ...base, topic: 'issuer' })).toEqual({ company: 'company' });
    expect(
      validateContact({ ...base, topic: 'issuer', company: 'Agro SA', cuit: '30-123', amount: 'mucho' }),
    ).toEqual({
      cuit: 'cuit',
      amount: 'amount',
    });
  });

  it('sends issuer fields only for issuers, with numbers parsed and the honeypot as typed', () => {
    const issuer = toRequest({
      ...base,
      topic: 'issuer',
      company: ' Agro SA ',
      cuit: '30-68192014-9',
      amount: '1.500.000',
      website: '',
    });
    expect(issuer).toMatchObject({
      topic: 'issuer',
      company: 'Agro SA',
      cuit: '30681920149',
      amountUsd: 1_500_000,
    });
    const general = toRequest({ ...base, company: 'X', cuit: '30681920149', amount: '10', website: 'spam' });
    expect(general).not.toHaveProperty('company');
    expect(general).not.toHaveProperty('amountUsd');
    expect(general.website).toBe('spam');
  });
});

describe('account closure and export', () => {
  it('picks the proof each kind of account gives', () => {
    expect(closeProof({ authProvider: 'email' })).toBe('password');
    expect(closeProof({ authProvider: 'wallet' })).toBe('wallet');
    expect(closeProof({ authProvider: 'google' })).toBe('session');
  });

  it('only closes when the word is typed and sends the right proof', () => {
    expect(confirmMatches(' cerrar ')).toBe(true);
    expect(confirmMatches('CERRA')).toBe(false);
    expect(closeRequest('password', { password: 'x' })).toEqual({ confirm: 'CERRAR', password: 'x' });
    const signature = { publicKey: 'G…', message: 'fractachain-close:1', signature: 'sig' };
    expect(closeRequest('wallet', { signature })).toEqual({ confirm: 'CERRAR', signature });
    expect(closeRequest('session', {})).toEqual({ confirm: 'CERRAR' });
    expect(exportFileName(new Date('2026-10-30T12:00:00Z'))).toBe('fractachain-datos-2026-10-30.json');
  });
});

describe('support inbox', () => {
  const msg = (id: string, createdAt: string): SupportMessage => ({
    id,
    topic: 'general',
    name: 'N',
    email: 'n@example.com',
    message: 'hola, una consulta',
    status: 'open',
    createdAt,
  });

  it('lists newest first and replies by email with the reference', () => {
    const sorted = sortInbox([msg('a', '2026-10-01T00:00:00Z'), msg('b', '2026-10-02T00:00:00Z')]);
    expect(sorted.map((m) => m.id)).toEqual(['b', 'a']);
    expect(replyHref(msg('sup_1', '2026-10-01T00:00:00Z'), 'Consulta')).toBe(
      'mailto:n%40example.com?subject=Consulta%20%C2%B7%20sup_1',
    );
  });
});
