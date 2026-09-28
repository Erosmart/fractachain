'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../context/I18nContext';

export default function AdminGate({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }
    if (!user.isAdmin) {
      router.replace('/dashboard');
    }
  }, [user, isLoading, pathname, router]);

  if (isLoading) {
    return <p className="py-16 text-center text-neutral-500">{t('misc.loadingSession')}</p>;
  }
  if (!user) return null;
  if (!user.isAdmin) {
    return <p className="py-16 text-center text-neutral-500">{t('misc.adminOnly')}</p>;
  }
  return <>{children}</>;
}
