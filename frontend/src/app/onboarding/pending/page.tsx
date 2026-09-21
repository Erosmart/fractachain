'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Clock } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { useI18n } from '../../../context/I18nContext';
import { useVisibleInterval } from '../../../lib/useVisibleInterval';

export default function PendingKycPage() {
  const { user, refreshUser, logout } = useAuth();
  const { t } = useI18n();
  const router = useRouter();

  useVisibleInterval(refreshUser, 4000, true);

  useEffect(() => {
    if (user?.kycStatus === 'APPROVED') router.replace('/dashboard');
    if (user && user.kycStatus === 'UNREGISTERED') router.replace('/onboarding/kyc');
  }, [user, router]);

  return (
    <div className="max-w-lg mx-auto py-16 text-center space-y-5">
      <Clock className="w-10 h-10 mx-auto" />
      <h1 className="text-3xl font-extrabold font-display">
        {user?.kycStatus === 'REJECTED' ? t('onboarding.rejectedTitle') : t('onboarding.pendingTitle')}
      </h1>
      <p className="text-neutral-600">
        {user?.kycStatus === 'REJECTED'
          ? t('onboarding.rejectedBody')
          : t('onboarding.pendingBody')}
      </p>
      <p className="text-sm text-neutral-500">
        {t('onboarding.pendingHint')}
      </p>
      <button type="button" onClick={logout} className="text-sm text-neutral-500">
        {t('auth.logout')}
      </button>
    </div>
  );
}
