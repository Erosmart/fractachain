import { safeNextPath } from './onboardingPath';

/** Session-scoped key: survives the round trip to the KYC provider, not a new tab or session. */
export const RETURN_TO_KEY = 'fc_return_to';

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function store(): Store | null {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : null;
  } catch {
    return null;
  }
}

/**
 * Where to send an investor once verification is done: the page they were on
 * (an offering) when they had to stop and verify. Only same-site paths.
 */
export const returnTo = {
  set(path: string, s: Store | null = store()): void {
    const safe = safeNextPath(path);
    if (safe && s) s.setItem(RETURN_TO_KEY, safe);
  },
  peek(s: Store | null = store()): string | null {
    return safeNextPath(s?.getItem(RETURN_TO_KEY) ?? null);
  },
  clear(s: Store | null = store()): void {
    s?.removeItem(RETURN_TO_KEY);
  },
};
