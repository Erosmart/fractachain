'use client';

import { Suspense } from 'react';
import LoginPage from './LoginInner';

export default function Page() {
  return (
    <Suspense fallback={<p className="py-16 text-center">Cargando…</p>}>
      <LoginPage />
    </Suspense>
  );
}
