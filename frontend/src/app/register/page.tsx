'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function RegisterPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/login');
  }, [router]);
  return <p className="py-16 text-center text-neutral-500">El registro es el mismo que el ingreso…</p>;
}
