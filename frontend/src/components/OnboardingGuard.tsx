'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth, nextOnboardingPath } from '../context/AuthContext';
import { useI18n } from '../context/I18nContext';

export default function OnboardingGuard({ children }: { children: React.ReactNode }) {
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
    const dest = nextOnboardingPath(user);
    if (dest !== '/dashboard') {
      router.replace(dest);
    }
  }, [user, isLoading, pathname, router]);

  if (isLoading) {
    return <p className="py-16 text-center text-neutral-500">{t('auth.loading')}</p>;
  }
  if (!user) return null;
  if (nextOnboardingPath(user) !== '/dashboard') return null;
  return <>{children}</>;
}
