import { useId, useState, type SubmitEvent } from 'react';
import { Clock3, Coins, IdCard, LogIn, Stamp, Wallet, X } from 'lucide-react';
import ChainSource from '@/components/tx/ChainSource';
import { assetAmount } from '@/components/tx/format';
import TxPanel from '@/components/tx/TxPanel';
import WalletStatusChip from '@/components/tx/WalletStatusChip';
import PhaseChip from '@/components/ui/PhaseChip';
import { CapProgress, ChecklistItem, Notice, StatusChip } from '@/components/ui/kit';
import { formatAmount } from '@/core/format/number';
import { useI18n } from '@/hooks/useI18n';
import { checkContribution, unitsFor } from '../../chainModel';
import { useNow } from '../../hooks/useNow';
import type { Offering } from '../../hooks/useOffering';
import { LIVE_PHASES, percentOf, timeLeft } from '../../model';
import MoneyFigure from '../MoneyFigure';

/** Actions whose status this box shows (the others show in their own cards). */
const BOX_ACTIONS = new Set(['contribute', 'usdc_trustline', 'fund', 'trustline']);

/**
 * Subscription box. Every figure is read from the tender contract (with its
 * contract id and the functions called); the form runs the contribution
 * through the one transaction flow: review → Freighter → Stellar.
 * Renders inline on desktop and inside the bottom sheet on phones.
 */
export default function InvestBox({ offering, onClose }: { offering: Offering; onClose?: () => void }) {
  const { t, locale } = useI18n();
  const { listing, user, tender, chainLoad, phase, activity, payment, selfCustody, flow, actions } = offering;
  const now = useNow();
  const ids = { amount: useId(), help: useId(), error: useId(), risk: useId() };
  const d = listing!.dossier;
  const code = tender?.code ?? '';
  const price = tender?.price ?? 0;
  const min = Math.max(d.minInvestmentUsdc || 0, price);
  const [amountStr, setAmountStr] = useState(() => String(min || ''));
  const [riskOk, setRiskOk] = useState(false);
  const [touched, setTouched] = useState(false);
  const fmt = (n: number) => assetAmount(n, code);
  const amount = Number(amountStr.replace(',', '.')) || 0;
  const capacity =
    tender?.hardCap !== null && tender?.hardCap !== undefined
      ? Math.max(0, tender.hardCap - tender.raised)
      : null;
  const check = checkContribution(amount, { price, min, capacity, balance: payment.balance });
  const live = Boolean(tender) && phase !== null && LIVE_PHASES.has(phase) && tender!.stateName === 'Open';

  const hasWallet = Boolean(user?.custodyMode && user.publicKey);
  const kyc = user?.kycStatus;
  const trusted = Boolean(user?.trustlines?.includes(listing!.id));
  const ready = Boolean(user) && hasWallet && kyc === 'APPROVED';
  const paymentReady = payment.trustline;
  const canSubmit = live && ready && paymentReady && check.ok && riskOk && !flow.busy;
  const riskError = touched && !riskOk;
  const flowHere = flow.snap.action !== null && BOX_ACTIONS.has(flow.snap.action);

  const dateFmt = (ms: number) =>
    new Date(ms).toLocaleDateString(locale === 'en' ? 'en-US' : 'es-AR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  const deadline = tender?.deadlineMs ?? null;
  const left = deadline ? timeLeft(deadline, now) : null;
  // Contracts deployed before `get_deadline` don't expose it: no clock rather than a guess.
  const clock = live
    ? !left
      ? null
      : !left.done
        ? `${t('offerings.invest.closesIn')} ${t('offerings.invest.countdown', { d: left.days, h: left.hours, m: left.minutes })}`
        : t('offerings.invest.deadlinePassed')
    : deadline
      ? t('offerings.invest.closedOn', { date: dateFmt(deadline) })
      : null;

  const errorText =
    !check.ok && touched
      ? t(`offerings.invest.errors.${check.error}`, {
          min: fmt(min),
          n:
            check.error === 'notMultiple'
              ? fmt(price)
              : fmt(check.error === 'aboveBalance' ? (payment.balance ?? 0) : (capacity ?? 0)),
        })
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

      {!tender ? (
        <div className="px-5 py-6 sm:px-6">
          {chainLoad === 'loading' ? (
            <p className="text-sm text-ink-2" role="status">
              {t('offerings.chain.loading')}
            </p>
          ) : chainLoad === 'none' ? (
            <Notice tone="sky">
              <p className="font-medium">{t('offerings.chain.notDeployed')}</p>
              <p className="mt-1 text-[13px] text-ink-2">{t('offerings.chain.notDeployedBody')}</p>
            </Notice>
          ) : (
            <Notice tone="bad">
              <p className="font-medium">{t('offerings.chain.unavailable')}</p>
              <p className="mt-1 text-[13px]">{t('offerings.chain.unavailableBody')}</p>
              <button
                type="button"
                className="btn btn-secondary btn-sm mt-3"
                onClick={() => void offering.reloadChain()}
              >
                {t('offerings.chain.retry')}
              </button>
            </Notice>
          )}
        </div>
      ) : (
        <>
          <div className="px-5 pt-6 sm:px-6">
            <p className="eyebrow text-ink-2">{t('offerings.invest.raised')}</p>
            <div className="mt-2 flex flex-wrap items-baseline gap-x-2">
              <MoneyFigure value={tender.raised} code={code} className="text-[52px] sm:text-[60px]" />
              {tender.hardCap !== null && (
                <span className="text-sm text-ink-2">
                  {t('offerings.invest.ofCap', { cap: fmt(tender.hardCap) })}
                </span>
              )}
            </div>
            {tender.hardCap !== null && (
              <>
                <p className="mt-1 text-xs text-ink-2 tnum">
                  {t('offerings.invest.reached', { p: percentOf(tender.raised, tender.hardCap) })}
                </p>
                <CapProgress
                  className="mt-3"
                  raised={tender.raised}
                  softCap={tender.softCap ?? 0}
                  hardCap={tender.hardCap}
                  format={fmt}
                />
              </>
            )}
            <ChainSource
              className="mt-3"
              contractId={tender.contractId}
              explorer={tender.explorer}
              reads={tender.reads}
              readAt={tender.readAt}
            />
          </div>

          <dl className="mt-4 grid grid-cols-2 [&>div]:border-ink/10 [&>div]:px-5 [&>div]:py-4 sm:[&>div]:px-6 [&>div:nth-child(odd)]:border-r [&>div]:border-t">
            <div>
              <dt className="eyebrow text-ink-2">{t('offerings.invest.price')}</dt>
              <dd className="mt-1.5">
                <MoneyFigure value={tender.price} code={code} className="text-[30px]" />
              </dd>
            </div>
            <div>
              <dt className="eyebrow text-ink-2">{t('offerings.invest.minimum')}</dt>
              <dd className="mt-1.5">
                <MoneyFigure value={min} code={code} className="text-[30px]" />
              </dd>
            </div>
            <div>
              <dt className="eyebrow text-ink-2">{t('offerings.invest.investors')}</dt>
              <dd className="numeral mt-1.5 text-[30px] text-ink">{activity ? activity.investors : '—'}</dd>
            </div>
            <div>
              <dt className="eyebrow text-ink-2">
                {yieldText ? t('offerings.invest.yield') : t('offerings.detail.terms.payment')}
              </dt>
              <dd className="numeral mt-1.5 text-[30px] text-ink">{yieldText ?? code}</dd>
            </div>
          </dl>
        </>
      )}

      <div className="m-3 mt-1 rounded-2xl bg-surface p-4 shadow-card sm:p-5">
        {user?.publicKey && (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <WalletStatusChip custodial={!selfCustody} expected={user.publicKey} />
            {tender?.holder && (
              <span className="text-xs text-ink-2 tnum">
                {t('offerings.chain.holderPayment', { code })}: {fmt(tender.holder.payment)}
              </span>
            )}
          </div>
        )}
        {live ? (
          <form onSubmit={submit} noValidate className="space-y-4">
            <div>
              <label htmlFor={ids.amount} className="label">
                {t('offerings.invest.amount', { u: code })}
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
                  {code}
                </span>
              </div>
              <p id={ids.help} className="mt-1.5 text-xs text-muted tnum">
                {t('offerings.invest.youGet', {
                  n: formatAmount(unitsFor(amount, price), 0),
                  code: d.tokenTicker,
                })}
                {capacity !== null && <> · {t('offerings.invest.capacity', { n: fmt(capacity) })}</>}
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

            {ready && payment.classic && !paymentReady && (
              <ChecklistItem
                icon={<Stamp className="h-4 w-4" />}
                title={t('offerings.funding.trustTitle', { code })}
                subtitle={t('offerings.funding.trustSub', { code })}
                trailing={
                  <button
                    type="button"
                    className="btn btn-soft btn-sm"
                    disabled={flow.busy}
                    onClick={() => void (selfCustody ? actions.enablePayment() : actions.fund())}
                  >
                    {t('offerings.funding.trustAction')}
                  </button>
                }
              />
            )}

            {ready && paymentReady && payment.classic && (payment.balance ?? 0) < min && (
              <ChecklistItem
                icon={<Coins className="h-4 w-4" />}
                title={t('offerings.funding.balanceTitle', { code })}
                subtitle={`${t('offerings.funding.balanceSub', { n: fmt(payment.balance ?? 0) })} · ${t(offering.usdcMode === 'team' ? 'offerings.funding.fundNoteTeam' : 'offerings.funding.fundNote')}`}
                trailing={
                  <button
                    type="button"
                    className="btn btn-soft btn-sm"
                    disabled={flow.busy}
                    onClick={() => void actions.fund()}
                  >
                    {t('offerings.funding.fundAction', { code })}
                  </button>
                }
              />
            )}

            {ready && !trusted && listing!.dossier.issuerPublicKey && (
              <ChecklistItem
                icon={<Stamp className="h-4 w-4" />}
                title={t('offerings.invest.reqToken', { code: d.tokenTicker })}
                subtitle={t('offerings.invest.reqTokenSub')}
                trailing={
                  <button
                    type="button"
                    className="btn btn-soft btn-sm"
                    disabled={flow.busy}
                    onClick={() => void actions.approve()}
                  >
                    {t('offerings.invest.approve')}
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
              disabled={!ready || !paymentReady || flow.busy}
            >
              {flow.busy && flow.snap.action === 'contribute' && flow.snap.phase !== 'preparing'
                ? t('offerings.invest.submitting')
                : t('offerings.invest.submit', { amount: fmt(amount || 0) })}
            </button>
          </form>
        ) : tender ? (
          <Notice tone="sky">{t('offerings.invest.notOpen')}</Notice>
        ) : null}
        {flowHere && (
          <TxPanel
            className="mt-3"
            snap={flow.snap}
            onSign={() => void flow.sign()}
            onRetry={() => void flow.retry()}
            onResign={() => flow.resign()}
            onClose={() => flow.reset()}
          />
        )}
      </div>
    </section>
  );
}
