import { useEffect, useRef, useState, type SubmitEvent } from 'react';
import { Camera, IdCard, ShieldCheck, Smartphone, SunMedium } from 'lucide-react';
import { withIsland } from '@/components/island/withIsland';
import { GradientPanel, Notice, PageHeader, PanelNote } from '@/components/ui/kit';
import SectionNav from '@/components/layout/SectionNav';
import { needsTerms, termsPath } from '@/core/auth/onboardingPath';
import { container } from '@/core/container';
import { errorMessage } from '@/core/errors';
import { ApiError } from '@/core/http/HttpClient';
import { imageToDataUrl } from '@/core/media/imageToDataUrl';
import { stepperIndex } from '@/core/onboarding/verification';
import { useAuth } from '@/hooks/useAuth';
import { useI18n } from '@/hooks/useI18n';
import { useKycProvider, useVerification } from '../hooks/useVerification';
import OnboardingFrame, { LoadingLine } from './OnboardingFrame';
import VerificationStatusCard from './VerificationStatusCard';
import WhileYouWait from './WhileYouWait';

const { navigator } = container;
const { onboarding, security } = container.services;

function DiditAside() {
  const { t } = useI18n();
  const tips = [
    { icon: IdCard, text: t('onboard.didit.tipDni') },
    { icon: SunMedium, text: t('onboard.didit.tipLight') },
    { icon: Smartphone, text: t('onboard.didit.tipDevice') },
  ];
  return (
    <GradientPanel
      title={t('onboard.didit.title')}
      subtitle={t('onboard.didit.subtitle')}
      footer={
        <PanelNote icon={<ShieldCheck className="h-4 w-4" />}>{t('onboard.didit.poweredBy')}</PanelNote>
      }
    >
      <ul className="space-y-3 px-5 pb-2 pt-5 sm:px-6">
        {tips.map(({ icon: Icon, text }) => (
          <li key={text} className="flex items-center gap-3 text-sm text-ink">
            <span
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-surface/70"
              aria-hidden="true"
            >
              <Icon className="h-4 w-4" />
            </span>
            {text}
          </li>
        ))}
      </ul>
      <p className="px-5 pb-5 pt-3 text-[13px] leading-relaxed text-ink-2 sm:px-6">
        {t('onboard.didit.privacy')}
      </p>
    </GradientPanel>
  );
}

function ManualAside() {
  const { t } = useI18n();
  return (
    <section className="card-muted p-5">
      <p className="title">{t('onboard.manual.title')}</p>
      <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{t('onboard.manual.body')}</p>
    </section>
  );
}

/**
 * Identity step. Before the data is sent: legal name + CUIT (+ email for
 * wallet-only accounts) and, without Didit, the selfie. After that this is
 * the "Verificación" page of the account: the status card and its action.
 */
function KycOnboardingPage() {
  const { user, submitKyc, isLoading } = useAuth();
  const { t, locale } = useI18n();
  const { info: provider, error: providerError } = useKycProvider();
  const fileRef = useRef<HTMLInputElement>(null);
  const isWalletAccount = user?.authProvider === 'wallet';
  const [legalName, setLegalName] = useState(user?.legalName || user?.name || '');
  const [kycEmail, setKycEmail] = useState('');
  const [cuit, setCuit] = useState(user?.cuit || '');
  const [selfie, setSelfie] = useState('');
  const [error, setError] = useState('');
  const [needsEmail, setNeedsEmail] = useState(false);
  const [resendState, setResendState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [busy, setBusy] = useState<'idle' | 'sending' | 'redirecting'>('idle');

  const editing = navigator.searchParam('edit') === '1';
  const submitted = Boolean(user && user.kycStatus !== 'UNREGISTERED');
  const showForm =
    busy !== 'idle' ||
    !submitted ||
    (editing && user?.kycStatus !== 'APPROVED' && user?.kycStatus !== 'REVOKED');
  const verification = useVerification({ sync: false });

  useEffect(() => {
    if (isLoading) return;
    if (!user) navigator.replace(navigator.loginUrl());
    else if (needsTerms(user) && !user.isAdmin) navigator.replace(termsPath(navigator.currentPath()));
    else if (!user.custodyMode && !user.isAdmin) navigator.replace('/onboarding/wallet');
  }, [user, isLoading]);

  const isDidit = provider?.provider === 'didit';
  const selfieRequired = !isDidit && !isWalletAccount;

  const submit = async (e: SubmitEvent) => {
    e.preventDefault();
    if (!provider) return;
    setError('');
    setNeedsEmail(false);
    setBusy('sending');
    const payload = {
      legalName: legalName.trim(),
      cuit: cuit.trim(),
      selfieDataUrl: !isDidit && selfie ? selfie : undefined,
      email: isWalletAccount ? kycEmail.trim() : undefined,
    };
    try {
      await submitKyc(payload);
    } catch (err) {
      const unverified = err instanceof ApiError && err.code === 'EMAIL_NOT_VERIFIED';
      setNeedsEmail(unverified);
      setError(unverified ? errorMessage(err, t('verify.kycNeedsEmail')) : errorMessage(err));
      setBusy('idle');
      return;
    }
    if (!isDidit) {
      navigator.navigate('/onboarding/pending');
      return;
    }
    try {
      setBusy('redirecting');
      navigator.navigate(await onboarding.startVerification(locale));
    } catch (err) {
      // The data is saved: the page switches to the status card, which can retry.
      setError(errorMessage(err, t('onboard.errors.startFail')));
      setBusy('idle');
      void verification.refresh();
      if (editing) navigator.replace('/onboarding/kyc');
    }
  };

  const resendVerification = async () => {
    setResendState('sending');
    try {
      await security.resendVerification();
      setResendState('sent');
    } catch (err) {
      setError(errorMessage(err));
      setResendState('idle');
    }
  };

  if (isLoading || (user && !provider && !providerError))
    return <LoadingLine>{t('auth.loading')}</LoadingLine>;
  if (!user) return null;

  if (!showForm) {
    const p = verification.presentation;
    const aside =
      !p || p.stage === 'approved' ? null : p.action === 'verify' && isDidit ? (
        <DiditAside />
      ) : p.action === 'form' && !isDidit ? (
        <ManualAside />
      ) : (
        <WhileYouWait />
      );
    return (
      <div className="mx-auto max-w-6xl space-y-6 sm:space-y-8">
        <SectionNav section="account" active="verification" />
        <PageHeader title={t('account.verification.title')} subtitle={t('account.verification.subtitle')} />
        {error && <Notice tone="bad">{error}</Notice>}
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <VerificationStatusCard state={verification} />
          {aside}
        </div>
      </div>
    );
  }

  const step = stepperIndex({ custodyMode: user.custodyMode, stage: 'needs_data' });

  return (
    <OnboardingFrame
      step={step}
      eyebrow={t('onboard.data.eyebrow')}
      title={t('onboard.data.title')}
      lead={isDidit ? t('onboard.data.leadDidit') : t('onboard.data.leadManual')}
      aside={provider ? isDidit ? <DiditAside /> : <ManualAside /> : undefined}
    >
      <form onSubmit={submit} className="card card-pad space-y-5">
        {providerError && <Notice tone="bad">{t('onboard.errors.providerFail')}</Notice>}
        <div>
          <label htmlFor="kyc-name" className="label">
            {t('onboard.data.legalName')}
          </label>
          <input
            id="kyc-name"
            required
            autoComplete="name"
            value={legalName}
            onChange={(e) => setLegalName(e.target.value)}
            className="input"
            aria-describedby="kyc-name-hint"
          />
          <p id="kyc-name-hint" className="mt-1.5 text-xs text-muted">
            {t('onboard.data.legalNameHint')}
          </p>
        </div>
        {isWalletAccount && (
          <div>
            <label htmlFor="kyc-email" className="label">
              {t('onboard.data.email')}
            </label>
            <input
              id="kyc-email"
              required
              type="email"
              autoComplete="email"
              value={kycEmail}
              onChange={(e) => setKycEmail(e.target.value)}
              placeholder="vos@mail.com"
              className="input"
              aria-describedby="kyc-email-hint"
            />
            <p id="kyc-email-hint" className="mt-1.5 text-xs text-muted">
              {t('onboard.data.emailHint')}
            </p>
          </div>
        )}
        <div>
          <label htmlFor="kyc-cuit" className="label">
            {t('onboard.data.cuit')}
          </label>
          <input
            id="kyc-cuit"
            required
            inputMode="numeric"
            autoComplete="off"
            pattern="[0-9\s.\-]{10,14}"
            value={cuit}
            onChange={(e) => setCuit(e.target.value)}
            placeholder="20-12345678-3"
            className="input tnum"
            aria-describedby="kyc-cuit-hint"
          />
          <p id="kyc-cuit-hint" className="mt-1.5 text-xs text-muted">
            {t('onboard.data.cuitHint')}
          </p>
        </div>

        {provider && !isDidit && (
          <div>
            <p className="label" id="kyc-selfie-label">
              {t('onboard.data.selfie')}
              {!selfieRequired && (
                <span className="ml-1.5 font-normal text-muted">({t('onboard.data.selfieOptional')})</span>
              )}
            </p>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              aria-labelledby="kyc-selfie-label"
              aria-describedby="kyc-selfie-hint"
              className="flex w-full items-center gap-4 rounded-2xl border border-dashed border-line-strong bg-surface-2 p-4 text-left transition-colors hover:border-sky-strong"
            >
              {selfie ? (
                <img src={selfie} alt="" className="h-16 w-16 rounded-xl object-cover" />
              ) : (
                <span
                  className="grid h-16 w-16 place-items-center rounded-xl bg-sky-soft text-ink"
                  aria-hidden="true"
                >
                  <Camera className="h-6 w-6" />
                </span>
              )}
              <span className="text-sm font-medium text-ink">
                {selfie ? t('onboard.data.selfieChange') : t('onboard.data.selfieCta')}
              </span>
            </button>
            <p id="kyc-selfie-hint" className="mt-1.5 text-xs text-muted">
              {t('onboard.data.selfieHint')}
            </p>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="user"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void imageToDataUrl(file).then(setSelfie);
              }}
            />
          </div>
        )}

        {error && <Notice tone="bad">{error}</Notice>}
        {needsEmail && (
          <button
            type="button"
            onClick={() => void resendVerification()}
            disabled={resendState !== 'idle'}
            className="btn btn-secondary btn-sm"
          >
            {resendState === 'sent'
              ? t('verify.sent')
              : resendState === 'sending'
                ? t('verify.sending')
                : t('verify.resend')}
          </button>
        )}

        <div className="flex flex-wrap items-center gap-3 border-t border-line pt-5">
          <button
            type="submit"
            disabled={!provider || busy !== 'idle' || (selfieRequired && !selfie)}
            className="btn btn-primary btn-lg"
          >
            {busy === 'redirecting'
              ? t('onboard.data.redirecting')
              : busy === 'sending'
                ? t('onboard.data.submitting')
                : isDidit
                  ? t('onboard.data.submitDidit')
                  : t('onboard.data.submitManual')}
          </button>
          {editing && (
            <a href="/onboarding/kyc" className="btn btn-ghost">
              {t('sec.cancelSetup')}
            </a>
          )}
        </div>
      </form>
    </OnboardingFrame>
  );
}

export default withIsland(KycOnboardingPage);
