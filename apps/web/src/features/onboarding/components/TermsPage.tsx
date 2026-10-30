import { useEffect, useId, useRef, useState, type SubmitEvent } from 'react';
import { ArrowRight, ArrowUpRight, Check, FileText } from 'lucide-react';
import { withIsland } from '@/components/island/withIsland';
import { Notice, StatusChip } from '@/components/ui/kit';
import { nextOnboardingPath, safeNextPath, TERMS_PATH } from '@/core/auth/onboardingPath';
import { container } from '@/core/container';
import { errorMessage } from '@/core/errors';
import { FALLBACK_TERMS_VERSION } from '@/features/auth/model';
import { useAuth } from '@/hooks/useAuth';
import { useI18n } from '@/hooks/useI18n';
import OnboardingFrame, { LoadingLine } from './OnboardingFrame';

const { navigator, api } = container;

const DOCS = [
  ['/legal/terms', 'terms'],
  ['/legal/privacy', 'privacy'],
  ['/legal/risks', 'risks'],
  ['/legal/cookies', 'cookies'],
] as const;

/** Where to go once the terms are accepted: `?next=` (same site) or the next onboarding step. */
function destination(user: Parameters<typeof nextOnboardingPath>[0]): string {
  const next = safeNextPath(navigator.searchParam('next'));
  if (next && next !== TERMS_PATH) return next;
  return nextOnboardingPath(user);
}

/**
 * First onboarding step for accounts that haven't accepted the current terms:
 * wallet and Google sign-ups (they never saw the sign-up checkboxes) and
 * everyone after a new version. The API refuses KYC and trading until then.
 */
function TermsPage() {
  const { user, isLoading, acceptTerms } = useAuth();
  const { t, messages } = useI18n();
  const ids = useId();
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [version, setVersion] = useState(FALLBACK_TERMS_VERSION);
  const box = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void api.account
      .legal()
      .then((v) => v?.termsVersion && setVersion(v.termsVersion))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (isLoading) return;
    if (!user) navigator.replace(navigator.loginUrl());
    // Already accepted (or an older API without the flag): nothing to do here.
    else if (user.termsAccepted !== false) navigator.replace(destination({ ...user, termsAccepted: true }));
  }, [user, isLoading]);

  if (isLoading) return <LoadingLine>{t('auth.loading')}</LoadingLine>;
  if (!user || user.termsAccepted !== false) return null;

  const isUpdate = Boolean(user.termsVersion && user.termsVersion !== version);

  const submit = async (e: SubmitEvent) => {
    e.preventDefault();
    setError('');
    if (!checked) {
      setError(t('onboard.terms.required'));
      box.current?.focus();
      return;
    }
    setSaving(true);
    try {
      const updated = await acceptTerms(version);
      navigator.navigate(destination(updated ?? { ...user, termsAccepted: true }));
    } catch (err) {
      setError(errorMessage(err));
      setSaving(false);
    }
  };

  return (
    <OnboardingFrame
      step={0}
      eyebrow={t('onboard.terms.eyebrow')}
      title={t('onboard.terms.title')}
      lead={t('onboard.terms.lead')}
      aside={
        <section className="card card-pad" aria-labelledby={`${ids}-docs`}>
          <h2 id={`${ids}-docs`} className="title">
            {t('onboard.terms.docsTitle')}
          </h2>
          <p className="subtitle mt-0.5">{t('onboard.terms.version', { version })}</p>
          <ul className="mt-4 space-y-2">
            {DOCS.map(([href, key]) => (
              <li key={key}>
                <a
                  href={href}
                  target="_blank"
                  rel="noopener"
                  className="flex items-center gap-3 rounded-xl border border-line bg-surface px-3.5 py-3 text-sm text-ink transition-colors hover:border-line-strong hover:bg-surface-2"
                >
                  <FileText className="h-4 w-4 shrink-0 text-ink-2" aria-hidden="true" />
                  <span className="flex-1">{t(`account.privacy.docs.${key}`)}</span>
                  <ArrowUpRight className="h-4 w-4 shrink-0 text-ink-2" aria-hidden="true" />
                  <span className="sr-only">{t('account.signup.newTab')}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      }
    >
      <form onSubmit={submit} noValidate className="card card-pad max-w-2xl space-y-5">
        {isUpdate && <Notice tone="sky">{t('onboard.terms.updated')}</Notice>}
        <ul className="space-y-3">
          {messages.onboard.terms.points.map((point) => (
            <li key={point} className="flex items-start gap-3 text-sm text-ink-2">
              <span
                className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md bg-sky-soft"
                aria-hidden="true"
              >
                <Check className="h-3 w-3 text-ink" strokeWidth={2.5} />
              </span>
              {point}
            </li>
          ))}
        </ul>
        <div className="flex items-start gap-3 rounded-xl border border-line bg-surface-2 p-4">
          <input
            ref={box}
            id={`${ids}-accept`}
            type="checkbox"
            checked={checked}
            aria-invalid={error && !checked ? true : undefined}
            aria-describedby={error ? `${ids}-error` : undefined}
            onChange={(e) => {
              setChecked(e.target.checked);
              if (e.target.checked) setError('');
            }}
            className="mt-0.5 h-4 w-4 shrink-0 accent-[rgb(var(--navy))]"
          />
          <label htmlFor={`${ids}-accept`} className="text-[13px] leading-relaxed text-ink">
            {t('onboard.terms.accept')}
          </label>
        </div>
        {error && (
          <p id={`${ids}-error`} className="text-sm text-bad" role="alert">
            {error}
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <StatusChip tone="neutral" icon={false}>
            {t('onboard.terms.version', { version })}
          </StatusChip>
          <button type="submit" disabled={saving} className="btn btn-primary">
            {saving ? t('onboard.terms.saving') : t('onboard.terms.submit')}
            {!saving && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
          </button>
        </div>
      </form>
    </OnboardingFrame>
  );
}

export default withIsland(TermsPage);
