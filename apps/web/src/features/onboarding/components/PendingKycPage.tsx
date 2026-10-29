import { useEffect } from 'react';
import { Clock } from 'lucide-react';
import { withIsland } from '@/components/island/withIsland';
import { container } from '@/core/container';
import { useAuth } from '@/hooks/useAuth';
import { useI18n } from '@/hooks/useI18n';
import { useVisibleInterval } from '@/hooks/useVisibleInterval';

const { navigator } = container;

/** Step 3: waits for the compliance decision, polling the session. */
function PendingKycPage() {
  const { user, isLoading, refreshUser, logout } = useAuth();
  const { t } = useI18n();

  useVisibleInterval(refreshUser, 4000, Boolean(user));

  useEffect(() => {
    if (isLoading) return;
    if (!user) navigator.replace('/login');
    else if (user.kycStatus === 'APPROVED') navigator.replace('/dashboard');
    else if (user.kycStatus === 'UNREGISTERED') navigator.replace('/onboarding/kyc');
  }, [user, isLoading]);

  const rejected = user?.kycStatus === 'REJECTED';
  return (
    <div className="max-w-lg mx-auto py-16 text-center space-y-5">
      <Clock className="w-10 h-10 mx-auto" />
      <h1 className="text-3xl font-extrabold font-display">{rejected ? t('onboarding.rejectedTitle') : t('onboarding.pendingTitle')}</h1>
      <p className="text-neutral-600">{rejected ? t('onboarding.rejectedBody') : t('onboarding.pendingBody')}</p>
      <p className="text-sm text-neutral-500">{t('onboarding.pendingHint')}</p>
      <button type="button" onClick={logout} className="text-sm text-neutral-500">
        {t('auth.logout')}
      </button>
    </div>
  );
}

export default withIsland(PendingKycPage);
