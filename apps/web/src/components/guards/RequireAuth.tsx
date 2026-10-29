import { useEffect, type ReactNode } from 'react';
import { container } from '@/core/container';
import { useI18n } from '@/hooks/useI18n';
import { useSession } from '@/hooks/useSession';

const { navigator } = container;

/** Any signed-in user, onboarding finished or not (UX only — the API checks the session). */
export default function RequireAuth({ children }: { children: ReactNode }) {
  const { user, isLoading } = useSession();
  const { t } = useI18n();

  useEffect(() => {
    if (!isLoading && !user) navigator.replace(navigator.loginUrl());
  }, [user, isLoading]);

  if (isLoading) return <p className="py-16 text-center text-neutral-500">{t('misc.loadingSession')}</p>;
  if (!user) return null;
  return <>{children}</>;
}
