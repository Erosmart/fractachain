import { ArrowRight, RefreshCw } from 'lucide-react';
import { Notice, StatusChip } from '@/components/ui/kit';
import { useI18n } from '@/hooks/useI18n';
import type { VerificationState } from '../hooks/useVerification';

/**
 * The verification status as one card: chip (icon + label), title, body and
 * the single action that state allows (benchmark §2e). Updates are announced
 * politely; the provider's redirect query string is never read here.
 */
export default function VerificationStatusCard({
  state,
  compact = false,
  className = '',
}: {
  state: VerificationState;
  compact?: boolean;
  className?: string;
}) {
  const { t, locale } = useI18n();
  const { view, presentation: p, loading, refreshing, error, leaving, checkedAt, refresh, verify } = state;

  if (loading && !view) {
    return (
      <section className={`card card-pad ${className}`} aria-busy="true">
        <p className="text-sm text-muted" role="status">
          {t('onboard.status.checking')}
        </p>
        <div className="mt-4 h-6 w-2/3 animate-pulse rounded-lg bg-ink/[0.06]" />
        <div className="mt-2 h-4 w-full animate-pulse rounded-lg bg-ink/[0.05]" />
      </section>
    );
  }

  if (!view || !p) {
    return (
      <section className={`card card-pad space-y-4 ${className}`}>
        <Notice tone="bad">{error || t('onboard.status.checkFail')}</Notice>
        <button type="button" className="btn btn-secondary" onClick={() => void refresh()}>
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          {t('onboard.status.retry')}
        </button>
      </section>
    );
  }

  const time = checkedAt?.toLocaleTimeString(locale === 'es' ? 'es-AR' : 'en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });
  const identity = view.identity;
  const showSupport = p.action === 'none' && (p.stage === 'rejected' || p.stage === 'revoked');
  const cta = p.copy.cta ? t(p.copy.cta) : '';

  return (
    <section className={`card card-pad ${className}`} aria-labelledby="kyc-status-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="eyebrow">{t('onboard.status.title')}</p>
        <StatusChip tone={p.tone}>{t(p.copy.chip)}</StatusChip>
      </div>

      <div aria-live="polite" aria-atomic="true">
        <h2
          id="kyc-status-title"
          className={`mt-4 font-normal tracking-[-0.02em] text-ink ${compact ? 'text-lg' : 'text-[22px] sm:text-2xl'}`}
        >
          {t(p.copy.title)}
        </h2>
        <p className="mt-1.5 max-w-xl text-sm text-ink-2">{t(p.copy.body)}</p>
        {(p.stage === 'rejected' || p.stage === 'revoked') && view.reason && (
          <p className="mt-2 max-w-xl text-sm text-ink">
            <span className="text-muted">{t('onboard.status.reason')}:</span> {view.reason}
          </p>
        )}
        {showSupport && (
          <p className="mt-2 max-w-xl text-sm text-muted">
            {t('onboard.status.supportNote')}{' '}
            <a href="/contacto?tema=kyc" className="font-medium text-ink underline underline-offset-2">
              {t('onboard.status.supportCta')}
            </a>
          </p>
        )}
      </div>

      {p.stage === 'approved' && identity?.fullName && (
        <dl className="mt-5 grid gap-x-6 gap-y-3 rounded-2xl bg-good-soft/60 px-4 py-3 text-sm sm:grid-cols-2">
          <div className="min-w-0">
            <dt className="text-xs text-ink-2">{t('onboard.status.verifiedAs')}</dt>
            <dd className="truncate font-medium text-ink">{identity.fullName}</dd>
          </div>
          {(identity.documentType || identity.issuingState) && (
            <div className="min-w-0">
              <dt className="text-xs text-ink-2">{t('onboard.status.document')}</dt>
              <dd className="truncate text-ink">
                {[identity.documentType, identity.issuingState].filter(Boolean).join(' · ')}
              </dd>
            </div>
          )}
        </dl>
      )}

      {error && (
        <Notice tone="bad" className="mt-4">
          {error}
        </Notice>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-2">
        {p.action === 'verify' && (
          <button type="button" className="btn btn-primary" onClick={() => void verify()} disabled={leaving}>
            {leaving ? t('onboard.data.redirecting') : cta}
            {!leaving && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
          </button>
        )}
        {p.action === 'form' && (
          <a href="/onboarding/kyc?edit=1" className="btn btn-primary">
            {cta}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </a>
        )}
        {p.action === 'invest' && (
          <a href="/market" className="btn btn-primary">
            {cta}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </a>
        )}
        {p.stage !== 'approved' && p.stage !== 'needs_data' && (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => void refresh()}
            disabled={refreshing || leaving}
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
            {t('onboard.status.retry')}
          </button>
        )}
      </div>

      {!compact && (
        <p className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line pt-4 text-xs text-muted">
          <span>
            {t('onboard.status.provider')}:{' '}
            <span className="text-ink-2">
              {view.provider === 'didit'
                ? t('onboard.status.providerDidit')
                : t('onboard.status.providerManual')}
            </span>
          </span>
          {time && <span>{t('onboard.status.updated', { time })}</span>}
          {p.poll && <span>{t('onboard.status.autoRefresh')}</span>}
        </p>
      )}
    </section>
  );
}
