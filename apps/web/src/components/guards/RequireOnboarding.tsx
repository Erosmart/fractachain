import { useEffect, type ReactNode } from 'react';
import { nextOnboardingPath } from '@/core/auth/onboardingPath';
import { container } from '@/core/container';
import { useI18n } from '@/hooks/useI18n';
import { useSession } from '@/hooks/useSession';

const { navigator } = container;

/**
 * Investor area: requires a session and a finished onboarding (wallet + KYC
 * approved). This is UX only — the API enforces the same rules server-side.
 */
export default function RequireOnboarding({ children }: { children: ReactNode }) {
  const { user, isLoading } = useSession();
  const { t } = useI18n();

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      navigator.replace(navigator.loginUrl());
      return;
    }
    const dest = nextOnboardingPath(user);
    if (dest !== '/dashboard') navigator.replace(dest);
  }, [user, isLoading]);

  if (isLoading) {
    return (
      <p className="py-20 text-center text-sm text-muted" role="status" aria-live="polite">
        {t('auth.loading')}
      </p>
    );
  }
  if (!user || nextOnboardingPath(user) !== '/dashboard') return null;
  return <>{children}</>;
}
