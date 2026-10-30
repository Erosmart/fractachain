import { Card, CapProgress, EmptyState, StatusChip } from '@/components/ui/kit';
import type { Pool, Position } from '@/core/api/types';
import { useI18n } from '@/hooks/useI18n';
import { money } from '@/features/portfolio/model/format';
import { poolChip, unitOf } from '@/features/portfolio/model/positions';

/**
 * The offerings the investor subscribed to (progress against minimum and
 * cap, plain-language state). Without any, the open ones to start with.
 */
export function OfferingsCard({
  pools,
  positions,
  className = '',
}: {
  pools: Pool[] | null;
  positions: Position[];
  className?: string;
}) {
  const { t } = useI18n();
  const mine = new Set(positions.map((p) => p.listingId));
  const subscribed = (pools ?? []).filter((p) => mine.has(p.id));
  const open = (pools ?? []).filter((p) => p.status === 'OPEN' && !mine.has(p.id));
  const rows = subscribed.length ? subscribed : open;
  const names = new Map(positions.map((p) => [p.listingId, p.legalName]));

  return (
    <Card
      className={className}
      title={subscribed.length ? t('dashboard.offerings.title') : t('dashboard.offerings.openTitle')}
      subtitle={subscribed.length ? t('dashboard.offerings.subtitle') : t('dashboard.offerings.openSub')}
      href="/market"
      hrefLabel={t('nav.market')}
    >
      {pools === null ? (
        <p className="py-6 text-center text-sm text-muted">{t('auth.loading')}</p>
      ) : rows.length === 0 ? (
        <EmptyState title={t('dashboard.offerings.empty')} className="!py-6" />
      ) : (
        <ul className="space-y-5">
          {rows.slice(0, 2).map((pool) => {
            const chip = poolChip(pool);
            const unit = unitOf(pool.paymentKind);
            const fmt = (n: number) => `${money(n, 0)} ${unit}`;
            return (
              <li key={pool.id}>
                <div className="flex items-start justify-between gap-3">
                  <a href={`/market/${encodeURIComponent(pool.id)}`} className="min-w-0 hover:underline">
                    <span className="block text-sm font-medium text-ink">
                      {pool.tokenTicker ?? pool.ticker ?? pool.id}
                    </span>
                    <span className="block truncate text-xs text-muted">
                      {names.get(pool.id) ?? pool.producerName.replace(/\s*\(CUIT.*\)$/, '')}
                    </span>
                  </a>
                  <StatusChip tone={chip.tone} className="shrink-0">
                    {t(`dashboard.chip.${chip.key}`)}
                  </StatusChip>
                </div>
                <p className="mt-2 text-xs text-ink-2 tnum">
                  {t('dashboard.offerings.raised', {
                    raised: money(pool.raisedAmount, 0),
                    cap: money(pool.hardCap, 0),
                    unit,
                  })}
                  {pool.status === 'OPEN' &&
                    ` · ${
                      pool.daysRemaining === 1
                        ? t('dashboard.offerings.daysLeftOne')
                        : t('dashboard.offerings.daysLeftMany', { n: pool.daysRemaining })
                    }`}
                </p>
                <CapProgress
                  className="mt-2"
                  raised={pool.raisedAmount}
                  softCap={pool.softCap}
                  hardCap={pool.hardCap}
                  format={fmt}
                />
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
