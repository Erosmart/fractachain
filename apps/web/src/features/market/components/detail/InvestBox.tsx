import { useId, useState, type SubmitEvent } from 'react';
import { Clock3, IdCard, LogIn, Stamp, Wallet, X } from 'lucide-react';
import { CapProgress, ChecklistItem, Notice, StatusChip } from '@/components/ui/kit';
import { formatAmount } from '@/core/format/number';
import { useI18n } from '@/hooks/useI18n';
import { useNow } from '../../hooks/useNow';
import type { Offering } from '../../hooks/useOffering';
import { checkAmount, LIVE_PHASES, money, percentOf, timeLeft, tokensFor } from '../../model';
import MoneyFigure from '../MoneyFigure';
import PhaseChip from '@/components/ui/PhaseChip';
import TxStatusLine from './TxStatusLine';

/**
 * Subscription box: where the raise stands, the clock, and the form with
 * its requirements (session, wallet, identity) and the risk acknowledgment.
 * Renders inline on desktop and inside the bottom sheet on phones.
 */
export default function InvestBox({ offering, onClose }: { offering: Offering; onClose?: () => void }) {
  const { t, locale } = useI18n();
  const { listing, user, unit, raised, phase, deadlineMs, activity, onChain, tx, busy, actions } = offering;
  const now = useNow();
  const ids = { amount: useId(), help: useId(), error: useId(), risk: useId() };
  const d = listing!.dossier;
  const min = d.minInvestmentUsdc || d.pricePerShareUsdc;
  const [amountStr, setAmountStr] = useState(() => String(min || ''));
  const [riskOk, setRiskOk] = useState(false);
  const [touched, setTouched] = useState(false);
  const fmt = (n: number) => money(n, unit);
  const price = Number(onChain.price || d.pricePerShareUsdc || 0);
  const amount = Number(amountStr.replace(',', '.')) || 0;
  const capacity = Math.max(0, d.offeringHardCapUsdc - raised);
  const check = checkAmount(amount, { min, capacity });
  const live = phase !== null && LIVE_PHASES.has(phase) && listing!.status === 'LISTED';

  const hasWallet = Boolean(user?.custodyMode && user.publicKey);
  const kyc = user?.kycStatus;
  const trusted = Boolean(user?.trustlines?.includes(listing!.id));
  const ready = Boolean(user) && hasWallet && kyc === 'APPROVED';
  const canSubmit = live && ready && check.ok && riskOk && busy === null;
  const riskError = touched && !riskOk;

  const dateFmt = (ms: number) =>
    new Date(ms).toLocaleDateString(locale === 'en' ? 'en-US' : 'es-AR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  const left = deadlineMs ? timeLeft(deadlineMs, now) : null;
  const closedAt = listing!.closedAt ? new Date(listing!.closedAt).getTime() : null;
  const clock = live
    ? left && !left.done
      ? `${t('offerings.invest.closesIn')} ${t('offerings.invest.countdown', { d: left.days, h: left.hours, m: left.minutes })}`
      : t('offerings.invest.deadlinePassed')
    : closedAt
      ? t('offerings.invest.closedOn', { date: dateFmt(closedAt) })
      : null;

  const errorText =
    !check.ok && touched
      ? t(`offerings.invest.errors.${check.error}`, { min: fmt(min), n: fmt(capacity) })
      : '';

  const submit = (e: SubmitEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!canSubmit) return;
    setTouched(false);
    void actions.subscribe(amount);
  };

  const yieldText =
    d.tnaUsd > 0
      ? t('offerings.invest.yieldValue', { n: formatAmount(d.tnaUsd, d.tnaUsd % 1 ? 1 : 0) })
      : null;

  return (
    <section className="gradient-panel flex flex-col" aria-labelledby={`${ids.amount}-title`}>
      <header className="flex items-start justify-between gap-3 px-5 pt-5 sm:px-6 sm:pt-6">
        <div className="min-w-0">
          <h2 id={`${ids.amount}-title`} className="title">
            {t('offerings.invest.title')}
          </h2>
          {clock && (
            <p className="mt-1 flex items-center gap-1.5 text-xs text-ink-2 tnum">
              <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
              {clock}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {phase && <PhaseChip phase={phase} className="bg-surface/70" />}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="icon-btn h-8 w-8 bg-surface/60"
              aria-label={t('offerings.invest.close')}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </header>

      <div className="px-5 pt-6 sm:px-6">
        <p className="eyebrow text-ink-2">{t('offerings.invest.raised')}</p>
        <div className="mt-2 flex flex-wrap items-baseline gap-x-2">
          <MoneyFigure value={raised} unit={unit} className="text-[52px] sm:text-[60px]" />
          <span className="text-sm text-ink-2">
            {t('offerings.invest.ofCap', { cap: fmt(d.offeringHardCapUsdc) })}
          </span>
        </div>
        <p className="mt-1 text-xs text-ink-2 tnum">
          {t('offerings.invest.reached', { p: percentOf(raised, d.offeringHardCapUsdc) })}
        </p>
        <CapProgress
          className="mt-3"
          raised={raised}
          softCap={d.offeringSoftCapUsdc}
          hardCap={d.offeringHardCapUsdc}
          format={fmt}
        />
      </div>

      <dl className="mt-4 grid grid-cols-2 [&>div]:border-ink/10 [&>div]:px-5 [&>div]:py-4 sm:[&>div]:px-6 [&>div:nth-child(odd)]:border-r [&>div]:border-t">
        <div>
          <dt className="eyebrow text-ink-2">{t('offerings.invest.investors')}</dt>
          <dd className="numeral mt-1.5 text-[30px] text-ink">{activity ? activity.investors : '—'}</dd>
        </div>
        <div>
          <dt className="eyebrow text-ink-2">{t('offerings.invest.minimum')}</dt>
          <dd className="mt-1.5">
            <MoneyFigure value={min} unit={unit} className="text-[30px]" />
          </dd>
        </div>
        <div>
          <dt className="eyebrow text-ink-2">{t('offerings.invest.price')}</dt>
          <dd className="mt-1.5">
            <MoneyFigure value={price} unit={unit} className="text-[30px]" />
          </dd>
        </div>
        <div>
          <dt className="eyebrow text-ink-2">
            {yieldText ? t('offerings.invest.yield') : t('offerings.detail.terms.payment')}
          </dt>
          <dd className="numeral mt-1.5 text-[30px] text-ink">{yieldText ?? unit}</dd>
        </div>
      </dl>

      <div className="m-3 mt-1 rounded-2xl bg-surface p-4 shadow-card sm:p-5">
        {live ? (
          <form onSubmit={submit} noValidate className="space-y-4">
            <div>
              <label htmlFor={ids.amount} className="label">
                {t('offerings.invest.amount', { u: unit })}
              </label>
              <div className="relative">
                <input
                  id={ids.amount}
                  className="input pr-16 text-base tnum"
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  value={amountStr}
                  aria-invalid={Boolean(errorText)}
                  aria-describedby={`${ids.help}${errorText ? ` ${ids.error}` : ''}`}
                  onChange={(e) => setAmountStr(e.target.value.replace(/[^\d.,]/g, ''))}
                  onBlur={() => setTouched(true)}
                  onFocus={(e) => e.target.select()}
                />
                <span className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-xs font-medium text-muted">
                  {unit}
                </span>
              </div>
              <p id={ids.help} className="mt-1.5 text-xs text-muted tnum">
                {t('offerings.invest.youGet', {
                  n: formatAmount(tokensFor(amount, price), 2),
                  code: d.tokenTicker,
                })}{' '}
                · {t('offerings.invest.capacity', { n: fmt(capacity) })}
              </p>
              {errorText && (
                <p id={ids.error} className="mt-1 text-xs font-medium text-bad">
                  {errorText}
                </p>
              )}
            </div>

            {!ready && (
              <div className="space-y-2">
                <p className="eyebrow">{t('offerings.invest.requirements')}</p>
                <ChecklistItem
                  done={Boolean(user)}
                  icon={<LogIn className="h-4 w-4" />}
                  title={t('offerings.invest.reqLogin')}
                  subtitle={t('offerings.invest.reqLoginSub')}
                  href={user ? undefined : `/login?next=${encodeURIComponent(`/market/${listing!.id}`)}`}
                />
                <ChecklistItem
                  done={hasWallet}
                  icon={<Wallet className="h-4 w-4" />}
                  title={t('offerings.invest.reqWallet')}
                  subtitle={t('offerings.invest.reqWalletSub')}
                  href={user && !hasWallet ? '/onboarding/wallet' : undefined}
                />
                <ChecklistItem
                  done={kyc === 'APPROVED'}
                  icon={<IdCard className="h-4 w-4" />}
                  title={t('offerings.invest.reqKyc')}
                  subtitle={
                    kyc === 'PENDING' ? t('offerings.invest.reqKycPending') : t('offerings.invest.reqKycSub')
                  }
                  trailing={
                    kyc === 'PENDING' ? (
                      <StatusChip tone="warn">{t('shell.kyc.PENDING')}</StatusChip>
                    ) : undefined
                  }
                  href={
                    user && hasWallet && kyc !== 'APPROVED'
                      ? kyc === 'PENDING'
                        ? '/onboarding/pending'
                        : '/onboarding/kyc'
                      : undefined
                  }
                />
              </div>
            )}

            {ready && !trusted && (
              <ChecklistItem
                icon={<Stamp className="h-4 w-4" />}
                title={t('offerings.invest.reqToken', { code: d.tokenTicker })}
                subtitle={t('offerings.invest.reqTokenSub')}
                trailing={
                  <button
                    type="button"
                    className="btn btn-soft btn-sm"
                    disabled={busy !== null}
                    onClick={() => void actions.approve()}
                  >
                    {busy === 'trustline' ? t('offerings.invest.approving') : t('offerings.invest.approve')}
                  </button>
                }
              />
            )}

            <label
              htmlFor={ids.risk}
              className="flex cursor-pointer items-start gap-2.5 text-[13px] text-ink-2"
            >
              <input
                id={ids.risk}
                type="checkbox"
                checked={riskOk}
                onChange={(e) => setRiskOk(e.target.checked)}
                aria-invalid={riskError}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-line-strong accent-[rgb(var(--navy))]"
              />
              <span>
                {t('offerings.invest.riskAck')}{' '}
                <a
                  href="#riesgos"
                  className="font-medium text-ink underline underline-offset-2"
                  onClick={onClose}
                >
                  {t('offerings.detail.risks.title')}
                </a>
              </span>
            </label>

            {riskError && (
              <p className="-mt-2 text-xs font-medium text-bad">{t('offerings.invest.errors.risk')}</p>
            )}

            <button
              type="submit"
              className="btn btn-primary btn-lg w-full"
              disabled={!ready || busy !== null}
            >
              {busy === 'contribute'
                ? t('offerings.invest.submitting')
                : t('offerings.invest.submit', { amount: fmt(amount || 0) })}
            </button>
          </form>
        ) : (
          <Notice tone="sky">{t('offerings.invest.notOpen')}</Notice>
        )}
        <TxStatusLine tx={tx} className="mt-3 empty:mt-0" />
      </div>
    </section>
  );
}
