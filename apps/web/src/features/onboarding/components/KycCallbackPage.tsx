import { useEffect } from 'react';
import { withIsland } from '@/components/island/withIsland';
import { container } from '@/core/container';
import { stepperIndex, verificationStage } from '@/core/onboarding/verification';
import { useAuth } from '@/hooks/useAuth';
import { useI18n } from '@/hooks/useI18n';
import { useVerification } from '../hooks/useVerification';
import OnboardingFrame, { LoadingLine } from './OnboardingFrame';
import WhileYouWait from './WhileYouWait';
import VerificationStatusCard from './VerificationStatusCard';

const { navigator } = container;

/**
 * Where Didit sends the browser back (`/onboarding/kyc/callback`). Didit
 * appends `?verificationSessionId=…&status=…`; that query string is NOT
 * trusted — the API re-reads the decision from Didit (sync) and the card
 * shows what the API says.
 */
function KycCallbackPage() {
  const { user, isLoading } = useAuth();
  const { t } = useI18n();
  const verification = useVerification({ sync: true });

  useEffect(() => {
    if (!isLoading && !user) navigator.replace(navigator.loginUrl());
  }, [user, isLoading]);

  // Drop the provider's query string from the address bar (and from history).
  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.search) {
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, []);

  if (isLoading) return <LoadingLine>{t('auth.loading')}</LoadingLine>;
  if (!user) return null;

  const stage = verification.view ? verificationStage(verification.view) : 'in_review';
  return (
    <OnboardingFrame
      step={stepperIndex({ custodyMode: user.custodyMode, stage })}
      eyebrow={t('onboard.status.eyebrow')}
      title={t('onboard.callback.title')}
      lead={t('onboard.callback.lead')}
      aside={stage === 'approved' ? undefined : <WhileYouWait />}
    >
      <VerificationStatusCard state={verification} />
    </OnboardingFrame>
  );
}

export default withIsland(KycCallbackPage);
