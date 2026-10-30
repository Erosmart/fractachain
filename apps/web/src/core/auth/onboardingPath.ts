import type { SessionUser } from './SessionUser';

type OnboardingUser = Pick<SessionUser, 'isAdmin' | 'custodyMode' | 'kycStatus'> & {
  /** `false` until the current terms are accepted; older API builds omit it (treated as accepted). */
  termsAccepted?: boolean;
};

export const TERMS_PATH = '/onboarding/terms';

/** The account must (re)accept the current terms before anything else. */
export function needsTerms(user: Pick<OnboardingUser, 'termsAccepted'> | null | undefined): boolean {
  return user?.termsAccepted === false;
}

/** Next step a signed-in user still has to complete, or `/dashboard` when done. */
export function nextOnboardingPath(user: OnboardingUser | null): string {
  if (!user) return '/login';
  if (user.isAdmin) return '/dashboard';
  if (needsTerms(user)) return TERMS_PATH;
  if (!user.custodyMode) return '/onboarding/wallet';
  if (user.kycStatus === 'UNREGISTERED') return '/onboarding/kyc';
  if (user.kycStatus !== 'APPROVED') return '/onboarding/pending';
  return '/dashboard';
}

/**
 * Where to land after signing in. Admins go to `?next=` or the KYC queue;
 * investors honour `?next=` only once onboarding is complete.
 */
export function afterAuthPath(user: OnboardingUser, nextParam?: string | null): string {
  const next = safeNextPath(nextParam);
  if (user.isAdmin) return next || '/admin/kyc';
  const dest = nextOnboardingPath(user);
  if (dest === TERMS_PATH) return termsPath(next);
  if (next && user.kycStatus === 'APPROVED') return next;
  return dest;
}

/** The terms step, coming back to `next` (a same-site path) once accepted. */
export function termsPath(next?: string | null): string {
  const safe = safeNextPath(next);
  return safe && safe !== TERMS_PATH ? `${TERMS_PATH}?next=${encodeURIComponent(safe)}` : TERMS_PATH;
}

/**
 * Only same-origin, absolute paths are accepted as `?next=` targets, so a
 * crafted login link cannot bounce the user to another site.
 */
export function safeNextPath(nextParam?: string | null): string | null {
  if (!nextParam) return null;
  if (!nextParam.startsWith('/') || nextParam.startsWith('//') || nextParam.startsWith('/\\')) return null;
  return nextParam;
}
