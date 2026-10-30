import { useEffect } from 'react';
import { withIsland } from '@/components/island/withIsland';
import { container } from '@/core/container';
import { stepperIndex, verificationStage } from '@/core/onboarding/verification';
import { useAuth } from '@/hooks/useAuth';
import { useI18n } from '@/hooks/useI18n';
import { useVerification } from '../hooks/useVerification';
import OnboardingFrame, { LoadingLine } from './OnboardingFrame';
import VerificationStatusCard from './VerificationStatusCard';
import WhileYouWait from './WhileYouWait';

const { navigator } = container;

/**
 * Review step: the verification status, re-read from the provider (through
 * the API) with backoff while it is pending.
 */
function PendingKycPage() {
  const { user, isLoading, logout } = useAuth();
  const { t } = useI18n();
  const verification = useVerification({ sync: true });

  useEffect(() => {
    if (isLoading) return;
    if (!user) navigator.replace(navigator.loginUrl());
    else if (!user.custodyMode && !user.isAdmin) navigator.replace('/onboarding/wallet');
    else if (user.kycStatus === 'UNREGISTERED') navigator.replace('/onboarding/kyc');
  }, [user, isLoading]);

  if (isLoading) return <LoadingLine>{t('auth.loading')}</LoadingLine>;
  if (!user || user.kycStatus === 'UNREGISTERED') return null;

  const stage = verification.view ? verificationStage(verification.view) : 'manual_review';
  return (
    <OnboardingFrame
      step={stepperIndex({ custodyMode: user.custodyMode, stage })}
      eyebrow={t('onboard.status.eyebrow')}
      title={t('onboard.status.title')}
      aside={stage === 'approved' ? undefined : <WhileYouWait />}
    >
      <VerificationStatusCard state={verification} />
      <div className="mt-4 flex flex-wrap gap-2">
        <a href="/account" className="btn btn-ghost btn-sm">
          {t('onboard.status.goAccount')}
        </a>
        <button type="button" onClick={logout} className="btn btn-ghost btn-sm">
          {t('onboard.status.logout')}
        </button>
      </div>
    </OnboardingFrame>
  );
}

export default withIsland(PendingKycPage);
