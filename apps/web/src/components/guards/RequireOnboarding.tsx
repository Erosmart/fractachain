import { useEffect, type ReactNode } from 'react';
import { needsTerms, termsPath } from '@/core/auth/onboardingPath';
import { container } from '@/core/container';
import { useI18n } from '@/hooks/useI18n';
import { useSession } from '@/hooks/useSession';

const { navigator } = container;

/**
 * Investor area: requires a session and the current terms. Wallet and KYC
 * are not required to look around — the screens show them as pending tasks
 * and ask for them where an operation needs them. This is UX only — the API
 * enforces the same rules server-side.
 */
export default function RequireOnboarding({ children }: { children: ReactNode }) {
  const { user, isLoading } = useSession();
  const { t } = useI18n();

  useEffect(() => {
    if (isLoading) return;
    if (!user) navigator.replace(navigator.loginUrl());
    else if (needsTerms(user) && !user.isAdmin) navigator.replace(termsPath(navigator.currentPath()));
  }, [user, isLoading]);

  if (isLoading) {
    return (
      <p className="py-20 text-center text-sm text-muted" role="status" aria-live="polite">
        {t('auth.loading')}
      </p>
    );
  }
  if (!user || (needsTerms(user) && !user.isAdmin)) return null;
  return <>{children}</>;
}
