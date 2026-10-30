import { ArrowUpRight, Layers } from 'lucide-react';
import { withIsland } from '@/components/island/withIsland';
import { CapProgress, EmptyState, Notice, StatusChip } from '@/components/ui/kit';
import type { Pool } from '@/core/api/types';
import { formatAmount } from '@/core/format/number';
import { useI18n } from '@/hooks/useI18n';
import { currencyOf, featuredPools, issuerName, poolChip, useLivePools } from '../livePools';

function OfferingCard({ pool }: { pool: Pool }) {
  const { t } = useI18n();
  const chip = poolChip(pool);
  const cur = currencyOf(pool);
  const fmt = (v: number) => `${formatAmount(v)} ${cur}`;
  const href = `/market/${encodeURIComponent(pool.id)}`;
  return (
    <article className="card card-pad group relative flex min-w-0 flex-col transition-shadow hover:shadow-lift">
      <header className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <StatusChip tone={chip.tone}>{t(`landing.offerings.status.${chip.key}`)}</StatusChip>
          {pool.commodityType && (
            <StatusChip tone="neutral" icon={false}>
              {pool.commodityType}
            </StatusChip>
          )}
        </div>
        <span className="arrow-btn" aria-hidden="true">
          <ArrowUpRight className="h-4 w-4" />
        </span>
      </header>
      <h3 className="mt-5 text-[17px] font-medium leading-snug text-ink">
        {/* The whole card is the link target; the heading carries the accessible name. */}
        <a href={href} className="after:absolute after:inset-0 after:rounded-card focus-visible:outline-none">
          {issuerName(pool)}
        </a>
      </h3>
      <p className="mt-1 truncate text-xs text-muted tnum">
        {[pool.tokenTicker, pool.isin].filter(Boolean).join(' · ')}
      </p>
      <div className="mt-6 flex items-baseline gap-1.5 text-ink">
        <span className="numeral text-[40px]">{formatAmount(pool.raisedAmount)}</span>
        <span className="text-xs text-ink-2">{t('landing.offerings.of', { cap: fmt(pool.hardCap) })}</span>
      </div>
      <CapProgress
        className="mt-4"
        raised={pool.raisedAmount}
        softCap={pool.softCap}
        hardCap={pool.hardCap}
        format={fmt}
      />
      <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-line pt-4 text-xs">
        <div>
          <dt className="text-muted">{t('landing.offerings.minTicket')}</dt>
          <dd className="mt-0.5 font-medium text-ink tnum">{fmt(pool.minInvestment)}</dd>
        </div>
        <div className="text-right">
          <dt className="text-muted">{pool.tna > 0 ? 'TNA' : t('landing.offerings.term')}</dt>
          <dd className="mt-0.5 font-medium text-ink tnum">
            {pool.tna > 0
              ? t('landing.offerings.tna', { tna: formatAmount(pool.tna, 1) })
              : pool.status === 'OPEN'
                ? t('landing.offerings.daysLeft', { days: pool.daysRemaining })
                : t('landing.offerings.closed')}
          </dd>
        </div>
      </dl>
    </article>
  );
}

/** Up to three offerings: open ones first, then the most funded. */
function OfferingCards() {
  const { t } = useI18n();
  const state = useLivePools();

  if (state.kind === 'error') return <Notice tone="warn">{t('landing.live.error')}</Notice>;
  if (state.kind === 'loading') {
    return (
      <div className="grid gap-4 md:grid-cols-3" aria-busy="true" aria-label={t('landing.live.loading')}>
        {[0, 1, 2].map((i) => (
          <div key={i} className="card h-[300px] animate-pulse bg-surface/60" />
        ))}
      </div>
    );
  }
  const pools = featuredPools(state.pools);
  if (!pools.length) {
    return (
      <div className="card">
        <EmptyState
          icon={<Layers className="h-5 w-5" />}
          title={t('landing.offerings.empty')}
          body={t('landing.offerings.emptyBody')}
        />
      </div>
    );
  }
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {pools.map((p) => (
        <OfferingCard key={p.id} pool={p} />
      ))}
    </div>
  );
}

export default withIsland(OfferingCards);
