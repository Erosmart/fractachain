import { useEffect, type ReactNode } from 'react';
import { container } from '@/core/container';
import { useI18n } from '@/hooks/useI18n';
import { useSession } from '@/hooks/useSession';

const { navigator } = container;

/** Admin area gate (UX only — every admin endpoint re-checks the role). */
export default function RequireAdmin({ children }: { children: ReactNode }) {
  const { user, isLoading } = useSession();
  const { t } = useI18n();

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      navigator.replace(navigator.loginUrl());
      return;
    }
    if (!user.isAdmin) navigator.replace('/dashboard');
  }, [user, isLoading]);

  if (isLoading) return <p className="py-16 text-center text-neutral-500">{t('misc.loadingSession')}</p>;
  if (!user) return null;
  if (!user.isAdmin) return <p className="py-16 text-center text-neutral-500">{t('misc.adminOnly')}</p>;
  return <>{children}</>;
}
