'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth, nextOnboardingPath } from '../context/AuthContext';

export default function OnboardingGuard({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
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
    return <p className="py-16 text-center text-neutral-500">Cargando sesión…</p>;
  }
  if (!user) return null;
  if (nextOnboardingPath(user) !== '/dashboard') return null;
  return <>{children}</>;
}
