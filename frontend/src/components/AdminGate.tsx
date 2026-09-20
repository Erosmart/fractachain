'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '../context/AuthContext';

export default function AdminGate({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
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
    return <p className="py-16 text-center text-neutral-500">Cargando sesión…</p>;
  }
  if (!user) return null;
  if (!user.isAdmin) {
    return <p className="py-16 text-center text-neutral-500">Esta sección es solo para el admin.</p>;
  }
  return <>{children}</>;
}
