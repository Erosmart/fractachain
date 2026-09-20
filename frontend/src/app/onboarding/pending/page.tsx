'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Clock } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';

export default function PendingKycPage() {
  const { user, refreshUser, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    const t = setInterval(() => refreshUser(), 4000);
    return () => clearInterval(t);
  }, [refreshUser]);

  useEffect(() => {
    if (user?.kycStatus === 'APPROVED') router.replace('/dashboard');
    if (user && user.kycStatus === 'UNREGISTERED') router.replace('/onboarding/kyc');
  }, [user, router]);

  return (
    <div className="max-w-lg mx-auto py-16 text-center space-y-5">
      <Clock className="w-10 h-10 mx-auto" />
      <h1 className="text-3xl font-extrabold font-display">
        {user?.kycStatus === 'REJECTED' ? 'Validación rechazada' : 'Pendiente de aprobación'}
      </h1>
      <p className="text-neutral-600">
        {user?.kycStatus === 'REJECTED'
          ? 'Un oficial rechazó la solicitud. No podés operar hasta una nueva revisión.'
          : 'Tus datos y la foto de la cara ya están en el panel de cumplimiento. Sin esa aprobación no se puede seguir al portfolio ni al mercado.'}
      </p>
      <p className="text-sm text-neutral-500">
        Un admin entra a <Link className="underline" href="/admin/kyc">/admin/kyc</Link> y aprueba la solicitud.
      </p>
      <button type="button" onClick={logout} className="text-sm text-neutral-500">
        Cerrar sesión
      </button>
    </div>
  );
}
