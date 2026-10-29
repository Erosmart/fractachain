import { describe, expect, it, vi } from 'vitest';
import { AccountSecurityService } from '@/core/account/AccountSecurityService';
import type { AuthApi } from '@/core/api/AuthApi';
import type { LoginResponse, SessionResponse } from '@/core/api/types';
import { AuthService } from '@/core/auth/AuthService';
import { passwordProblem } from '@/core/auth/passwordRules';
import { MemorySessionCache } from '@/core/auth/SessionCache';
import { SessionStore } from '@/core/auth/SessionStore';
import { normalizeUser } from '@/core/auth/SessionUser';
import type { IGoogleAuthProvider } from '@/core/firebase/FirebaseAuthProvider';
import { formatSecret, isTotpUri } from '@/core/security/otpauth';
import type { UsdcFundingService } from '@/core/wallet/UsdcFundingService';
import type { IWalletSigner } from '@/core/wallet/WalletSigner';
import { actorLabel, detailsText } from '@/features/admin/audit/model';

const session = (user: Record<string, unknown>): SessionResponse => ({
  success: true,
  token: 'fc2.body-only-for-non-browser-clients',
  expiresAt: '2099-01-01T00:00:00.000Z',
  user,
});

function setup(api: Partial<Record<keyof AuthApi, unknown>>) {
  const store = new SessionStore(new MemorySessionCache());
  store.hydrate();
  const usdc = { ensureReady: vi.fn(async () => ({})) };
  const auth = new AuthService(
    api as unknown as AuthApi,
    store,
    {} as IWalletSigner,
    { signIn: vi.fn(), signOut: vi.fn(async () => undefined) } as unknown as IGoogleAuthProvider,
    usdc as unknown as UsdcFundingService,
  );
  return { store, auth, usdc, security: new AccountSecurityService(api as unknown as AuthApi, store) };
}

describe('AuthService', () => {
  it('signs in without ever keeping the token', async () => {
    const { auth, store } = setup({
      loginWithEmail: vi.fn(async (): Promise<LoginResponse> => session({ id: 'u1', email: 'a@b.c' })),
    });
    const result = await auth.loginWithEmail('a@b.c', 'secret-pass');
    expect(result).toMatchObject({ status: 'signed-in', user: { id: 'u1' } });
    expect(store.getSnapshot()).toMatchObject({ user: { id: 'u1' }, expiresAt: '2099-01-01T00:00:00.000Z' });
    expect(JSON.stringify(store.getSnapshot())).not.toContain('fc2.');
  });

  it('stops at the 2FA challenge and finishes with the code', async () => {
    const verifyTwoFactor = vi.fn(async () =>
      session({ id: 'u2', email: 'x@y.z', custodyMode: 'CUSTODIAL', publicKey: 'GABC' }),
    );
    const { auth, store, usdc } = setup({
      loginWithEmail: vi.fn(async (): Promise<LoginResponse> => ({
        success: true,
        twoFactorRequired: true,
        challenge: 'ch-1',
        expiresAt: '2099-01-01T00:00:00.000Z',
      })),
      verifyTwoFactor,
    });
    const first = await auth.loginWithEmail('x@y.z', 'secret-pass');
    expect(first).toEqual({
      status: 'two-factor',
      challenge: { challenge: 'ch-1', expiresAt: '2099-01-01T00:00:00.000Z' },
    });
    expect(store.getSnapshot().user).toBeNull();
    expect(store.getSnapshot().pendingTwoFactor?.challenge).toBe('ch-1');

    const user = await auth.completeTwoFactor('123 456');
    expect(verifyTwoFactor).toHaveBeenCalledWith('ch-1', '123456');
    expect(user.id).toBe('u2');
    expect(store.getSnapshot().pendingTwoFactor).toBeNull();
    // Same post-login step as a direct email login with a wallet.
    expect(usdc.ensureReady).toHaveBeenCalledOnce();
  });

  it('keeps the challenge after a wrong code and drops it on cancel', async () => {
    const { auth, store } = setup({
      loginWithEmail: vi.fn(async (): Promise<LoginResponse> => ({
        success: true,
        twoFactorRequired: true,
        challenge: 'ch-2',
      })),
      verifyTwoFactor: vi.fn(async () => {
        throw new Error('401');
      }),
    });
    await auth.loginWithEmail('x@y.z', 'secret-pass');
    await expect(auth.completeTwoFactor('000000')).rejects.toThrow();
    expect(store.getSnapshot().pendingTwoFactor?.challenge).toBe('ch-2');
    expect(store.getSnapshot().isLoading).toBe(false);
    auth.cancelTwoFactor();
    expect(store.getSnapshot().pendingTwoFactor).toBeNull();
  });

  it('logs out through the API and clears local state even if the call fails', async () => {
    const logout = vi.fn(async () => {
      throw new Error('offline');
    });
    const { auth, store } = setup({ logout, loginWithEmail: vi.fn(async () => session({ id: 'u1' })) });
    await auth.loginWithEmail('a@b.c', 'secret-pass');
    auth.logout();
    expect(logout).toHaveBeenCalledOnce();
    expect(store.getSnapshot().user).toBeNull();
  });
});

describe('AccountSecurityService', () => {
  it('enables 2FA, refreshes the user and returns the recovery codes', async () => {
    const { auth, store, security } = setup({
      loginWithEmail: vi.fn(async () => session({ id: 'u1' })),
      enableTwoFactor: vi.fn(async () => ({
        recoveryCodes: ['aaaa-bbbb', 'cccc-dddd'],
        user: { id: 'u1', twoFactorEnabled: true },
      })),
    });
    await auth.loginWithEmail('a@b.c', 'secret-pass');
    await expect(security.enableTwoFactor(' 123 456 ')).resolves.toEqual(['aaaa-bbbb', 'cccc-dddd']);
    expect(store.getSnapshot().user?.twoFactorEnabled).toBe(true);
  });

  it('signs this tab out after revoking every session', async () => {
    const { auth, store, security } = setup({
      loginWithEmail: vi.fn(async () => session({ id: 'u1' })),
      revokeAllSessions: vi.fn(async () => undefined),
    });
    await auth.loginWithEmail('a@b.c', 'secret-pass');
    await security.revokeAllSessions();
    expect(store.getSnapshot().user).toBeNull();
  });

  it('updates the signed-in user only when the verified email is theirs', async () => {
    const { auth, store, security } = setup({
      loginWithEmail: vi.fn(async () => session({ id: 'u1', authProvider: 'email', emailVerified: false })),
      verifyEmail: vi.fn(async () => ({ user: { id: 'other', emailVerified: true } })),
    });
    await auth.loginWithEmail('a@b.c', 'secret-pass');
    expect(store.getSnapshot().user?.emailVerified).toBe(false);
    await security.verifyEmail('tok');
    expect(store.getSnapshot().user?.id).toBe('u1');
    expect(store.getSnapshot().user?.emailVerified).toBe(false);
  });
});

describe('helpers', () => {
  it('accepts only TOTP otpauth URIs for the QR', () => {
    expect(isTotpUri('otpauth://totp/Fractachain:ana%40x.com?secret=ABC&issuer=Fractachain')).toBe(true);
    expect(isTotpUri('https://evil.example')).toBe(false);
    expect(isTotpUri('otpauth://hotp/x?secret=A')).toBe(false);
  });

  it('groups secrets for manual entry', () => {
    expect(formatSecret('jbswy3dpehpk3pxp')).toBe('JBSW Y3DP EHPK 3PXP');
  });

  it('checks new passwords like the API', () => {
    expect(passwordProblem('short', 'short')).toBe('too-short');
    expect(passwordProblem('long-enough', 'long-enougH')).toBe('mismatch');
    expect(passwordProblem('long-enough', 'long-enough')).toBeNull();
  });

  it('normalizes the security flags (older API builds never nag)', () => {
    expect(normalizeUser({ id: 'u' })).toMatchObject({ twoFactorEnabled: false, emailVerified: true });
    expect(normalizeUser({ id: 'u', emailVerified: false, twoFactorEnabled: true })).toMatchObject({
      twoFactorEnabled: true,
      emailVerified: false,
    });
  });

  it('labels audit actors and details', () => {
    const base = {
      id: '1',
      at: '2026-01-01T00:00:00Z',
      actorId: null,
      actorEmail: null,
      action: 'sweep',
      target: null,
      ip: null,
      requestId: null,
      outcome: 'success' as const,
    };
    expect(actorLabel(base, 'sistema')).toBe('sistema');
    expect(actorLabel({ ...base, actorEmail: 'a@b.c' }, 'sistema')).toBe('a@b.c');
    expect(detailsText(base)).toBeNull();
    expect(detailsText({ ...base, details: { reason: 'x' } })).toContain('"reason"');
  });
});
