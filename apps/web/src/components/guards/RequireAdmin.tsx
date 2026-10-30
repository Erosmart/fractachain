import { useEffect, type ReactNode } from 'react';
import { ShieldAlert } from 'lucide-react';
import { EmptyState } from '@/components/ui/kit';
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

  if (isLoading) {
    return (
      <p className="py-16 text-center text-sm text-muted" aria-busy="true">
        {t('admin.guard.loading')}
      </p>
    );
  }
  if (!user) return null;
  if (!user.isAdmin) {
    return (
      <EmptyState
        icon={<ShieldAlert className="h-5 w-5" aria-hidden="true" />}
        title={t('admin.guard.adminOnly')}
        className="py-16"
      />
    );
  }
  return <>{children}</>;
}
