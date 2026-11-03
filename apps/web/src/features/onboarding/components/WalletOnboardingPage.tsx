import { useEffect, useState, type ReactNode } from 'react';
import { ArrowRight, Check, Copy, KeyRound, Landmark, ShieldAlert, Wallet } from 'lucide-react';
import { withIsland } from '@/components/island/withIsland';
import { Notice, StatusChip } from '@/components/ui/kit';
import { needsTerms, termsPath } from '@/core/auth/onboardingPath';
import { container } from '@/core/container';
import { errorMessage } from '@/core/errors';
import { useAuth } from '@/hooks/useAuth';
import { useI18n } from '@/hooks/useI18n';
import OnboardingFrame, { LoadingLine } from './OnboardingFrame';

const { navigator } = container;

function Option({
  icon,
  title,
  body,
  badge,
  disabled,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  body: string;
  badge?: ReactNode;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="card card-pad group flex h-full flex-col items-start gap-4 text-left transition-colors hover:border-line-strong hover:shadow-lift disabled:cursor-wait disabled:opacity-60"
    >
      <span className="flex w-full items-start justify-between gap-3">
        <span
          className="grid h-11 w-11 place-items-center rounded-xl bg-sky-soft text-ink"
          aria-hidden="true"
        >
          {icon}
        </span>
        {badge}
      </span>
      <span className="space-y-1.5">
        <span className="block text-[17px] font-medium text-ink">{title}</span>
        <span className="block text-sm leading-relaxed text-ink-2">{body}</span>
      </span>
      <ArrowRight
        className="mt-auto h-4 w-4 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-ink"
        aria-hidden="true"
      />
    </button>
  );
}

/** Step 2 of onboarding: custodial wallet, generated self-custody key, or Freighter. */
function WalletOnboardingPage() {
  const { user, chooseCustody, linkFreighterWallet, revealedSecret, isLoading } = useAuth();
  const { t } = useI18n();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const mustLogin = !isLoading && !user;
  const alreadyChosen = Boolean(user?.custodyMode && !revealedSecret);

  useEffect(() => {
    if (mustLogin) navigator.replace(navigator.loginUrl());
    else if (needsTerms(user)) navigator.replace(termsPath(navigator.currentPath()));
    else if (alreadyChosen) navigator.replace('/onboarding/kyc');
  }, [mustLogin, alreadyChosen, user]);

  const pick = async (mode: 'CUSTODIAL' | 'SELF', publicKey?: string) => {
    setError('');
    setBusy(true);
    try {
      await chooseCustody(mode, publicKey);
      if (mode === 'CUSTODIAL' || publicKey) navigator.navigate('/onboarding/kyc');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const pickFreighter = async () => {
    setError('');
    setBusy(true);
    try {
      // Signs a challenge: the backend checks the investor controls the key and
      // stores publicKey + custodyMode=SELF before moving on to KYC.
      await linkFreighterWallet();
      navigator.navigate('/onboarding/kyc');
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  const copySecret = async () => {
    if (!revealedSecret) return;
    try {
      await window.navigator.clipboard.writeText(revealedSecret);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard blocked: the key stays selectable on screen
    }
  };

  if (isLoading) return <LoadingLine>{t('auth.loading')}</LoadingLine>;
  if (mustLogin || alreadyChosen) return null;

  return (
    <OnboardingFrame
      step={1}
      eyebrow={t('onboard.wallet.eyebrow')}
      title={t('onboarding.walletTitle')}
      lead={t('onboarding.walletLead')}
    >
      {revealedSecret ? (
        <section className="card card-pad max-w-2xl space-y-4" aria-labelledby="secret-title">
          <div className="flex items-start gap-3">
            <span
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-warn-soft text-warn"
              aria-hidden="true"
            >
              <ShieldAlert className="h-5 w-5" />
            </span>
            <div>
              <h2 id="secret-title" className="title">
                {t('onboard.wallet.secretTitle')}
              </h2>
              <p className="mt-1 text-sm text-ink-2">{t('onboarding.secretWarn')}</p>
            </div>
          </div>
          <code className="block select-all break-all rounded-xl border border-line bg-surface-2 px-4 py-3 font-mono text-[13px] text-ink">
            {revealedSecret}
          </code>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-secondary" onClick={() => void copySecret()}>
              {copied ? (
                <Check className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Copy className="h-4 w-4" aria-hidden="true" />
              )}
              {copied ? t('onboard.wallet.copied') : t('onboard.wallet.copy')}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                container.stores.session.setRevealedSecret(null);
                navigator.navigate('/onboarding/kyc');
              }}
            >
              {t('onboarding.secretCta')}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </section>
      ) : (
        <div className="max-w-2xl space-y-4">
          <Option
            icon={<Landmark className="h-5 w-5" />}
            title={t('onboarding.custodialTitle')}
            body={t('onboarding.custodialBody')}
            badge={
              <StatusChip tone="sky" icon={false}>
                {t('onboard.wallet.recommended')}
              </StatusChip>
            }
            disabled={busy}
            onClick={() => void pick('CUSTODIAL')}
          />
          {/* Most investors never need these; they stay one click away. */}
          <details className="group rounded-2xl border border-line bg-surface-2 px-4 py-3">
            <summary className="cursor-pointer list-none text-sm font-medium text-ink [&::-webkit-details-marker]:hidden">
              {t('onboard.wallet.advanced')}
              <span className="mt-0.5 block text-xs font-normal text-muted">
                {t('onboard.wallet.advancedHint')}
              </span>
            </summary>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Option
                icon={<Wallet className="h-5 w-5" />}
                title={t('onboarding.freighterTitle')}
                body={t('onboarding.freighterBody')}
                disabled={busy}
                onClick={() => void pickFreighter()}
              />
              <Option
                icon={<KeyRound className="h-5 w-5" />}
                title={t('onboarding.selfTitle')}
                body={t('onboarding.selfBody')}
                disabled={busy}
                onClick={() => void pick('SELF')}
              />
            </div>
          </details>
          <p className="text-xs text-muted">{t('onboard.wallet.trustlineNote')}</p>
        </div>
      )}
      {error && (
        <Notice tone="bad" className="mt-4">
          {error}
        </Notice>
      )}
    </OnboardingFrame>
  );
}

export default withIsland(WalletOnboardingPage);
