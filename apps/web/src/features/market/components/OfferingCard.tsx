import { ArrowUpRight } from 'lucide-react';
import { CapProgress } from '@/components/ui/kit';
import type { Pool } from '@/core/api/types';
import { formatAmount } from '@/core/format/number';
import { useI18n } from '@/hooks/useI18n';
import { companyName, LIVE_PHASES, money, percentOf, unitOf, type OfferingPhase } from '../model';
import MoneyFigure from './MoneyFigure';
import PhaseChip from '@/components/ui/PhaseChip';

/** Catalog card: who raises, how far along, the floor and the clock. One link per card. */
export default function OfferingCard({ pool, phase }: { pool: Pool; phase: OfferingPhase }) {
  const { t } = useI18n();
  const unit = unitOf(pool.paymentKind);
  const name = companyName(pool);
  const fmt = (n: number) => money(n, unit);
  const live = LIVE_PHASES.has(phase);
  const days = Math.max(0, pool.daysRemaining);
  const clock = !live
    ? t('offerings.card.ended')
    : days === 0
      ? t('offerings.card.closesToday')
      : days === 1
        ? t('offerings.card.closesInOne')
        : t('offerings.card.closesIn', { n: days });

  return (
    <article className="card card-pad group relative flex min-w-0 flex-col transition-shadow hover:shadow-lift">
      <header className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <PhaseChip phase={phase} />
          {pool.commodityType && <span className="chip chip-neutral">{pool.commodityType}</span>}
        </div>
        <span className="arrow-btn transition-colors group-hover:bg-sky/30" aria-hidden="true">
          <ArrowUpRight className="h-4 w-4" />
        </span>
      </header>

      <h2 className="mt-4 text-lg font-medium leading-snug tracking-[-0.01em] text-ink">
        <a
          href={`/market/${encodeURIComponent(pool.id)}`}
          aria-label={t('offerings.card.viewAria', { name })}
          className="rounded-sm after:absolute after:inset-0 after:rounded-card after:content-[''] focus-visible:outline-none focus-visible:after:outline focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-sky-strong"
        >
          {name}
        </a>
      </h2>
      <p className="subtitle mt-1 truncate">
        {t('offerings.card.instrument')}
        {pool.tokenTicker ? ` · ${pool.tokenTicker}` : ''}
        {pool.location ? ` · ${pool.location}` : ''}
      </p>

      <div className="mt-6 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <MoneyFigure value={pool.raisedAmount} unit={unit} />
        <span className="text-sm text-ink-2">{t('offerings.card.raisedOf', { cap: fmt(pool.hardCap) })}</span>
      </div>
      <p className="mt-1 text-xs text-muted tnum">
        {t('offerings.card.reached', { p: percentOf(pool.raisedAmount, pool.hardCap) })}
      </p>
      <CapProgress
        className="mt-3"
        raised={pool.raisedAmount}
        softCap={pool.softCap}
        hardCap={pool.hardCap}
        format={fmt}
      />

      <dl className="mt-5 grid grid-cols-3 gap-3 border-t border-line pt-4 text-xs">
        <div className="min-w-0">
          <dt className="text-muted">{t('offerings.card.min')}</dt>
          <dd className="mt-1 truncate font-medium text-ink tnum">{fmt(pool.minInvestment)}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-muted">{t('offerings.card.tna')}</dt>
          <dd className="mt-1 truncate font-medium text-ink tnum">
            {pool.tna > 0 ? `${formatAmount(pool.tna, pool.tna % 1 ? 1 : 0)} %` : t('offerings.card.noYield')}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="sr-only">{t('offerings.invest.closesIn')}</dt>
          <dd className={`mt-[1.15rem] truncate text-right ${live ? 'font-medium text-ink' : 'text-muted'}`}>
            {clock}
          </dd>
        </div>
      </dl>
    </article>
  );
}
