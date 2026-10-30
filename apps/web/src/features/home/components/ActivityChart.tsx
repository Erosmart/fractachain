import { useMemo } from 'react';
import { ArrowUpRight } from 'lucide-react';
import ExternalLink from '@/components/ui/ExternalLink';
import { Card, DenseBars, type BarDatum } from '@/components/ui/kit';
import { explorerAccount } from '@/core/format/number';
import { useI18n } from '@/hooks/useI18n';
import type { ActivityStatus } from '@/features/portfolio/hooks/useWalletActivity';
import { dailyCounts, type HorizonOperation } from '@/features/portfolio/model/activity';
import { shortDate } from '@/features/portfolio/model/format';

/**
 * On-chain operations of the wallet per day (single series, read from
 * Horizon). Today is the ink bar with the butter pill; no threshold line —
 * there is no real one for activity.
 */
export function ActivityChart({
  publicKey,
  ops,
  status,
  days,
  className = '',
}: {
  publicKey?: string;
  ops: HorizonOperation[];
  status: ActivityStatus;
  days: number;
  className?: string;
}) {
  const { t, locale } = useI18n();
  const counts = useMemo(() => dailyCounts(ops, new Date(), days), [ops, days]);
  const data: BarDatum[] = counts.map((c) => ({
    key: c.key,
    label: shortDate(c.date, locale),
    value: c.count,
  }));
  const today = counts[counts.length - 1];
  const format = (n: number) =>
    n === 1 ? t('dashboard.activity.countOne') : t('dashboard.activity.countMany', { n });
  const mid = Math.floor((counts.length - 1) / 2);
  const ticks = counts.length
    ? [
        { index: 0, label: shortDate(counts[0].date, locale) },
        { index: mid, label: shortDate(counts[mid].date, locale) },
        { index: counts.length - 1, label: shortDate(today.date, locale) },
      ]
    : [];
  const total = counts.reduce((s, c) => s + c.count, 0);

  return (
    <Card
      className={className}
      title={t('dashboard.activity.title')}
      subtitle={t('dashboard.activity.subtitle', { days })}
      actions={
        publicKey ? (
          <ExternalLink
            href={explorerAccount(publicKey)}
            className="arrow-btn"
            aria-label={t('dashboard.activity.explorer')}
            title={t('dashboard.activity.explorer')}
          >
            <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
          </ExternalLink>
        ) : undefined
      }
    >
      {!publicKey ? (
        <p className="py-8 text-sm text-muted">{t('dashboard.activity.noWallet')}</p>
      ) : status === 'error' ? (
        <p className="py-8 text-sm text-muted">{t('dashboard.activity.unavailable')}</p>
      ) : (
        <div className={status === 'loading' ? 'opacity-50 transition-opacity' : 'transition-opacity'}>
          <DenseBars
            data={data}
            format={format}
            summary={t('dashboard.activity.summary', { days, today: format(today?.count ?? 0) })}
            columns={[t('dashboard.activity.columns'), t('dashboard.activity.columnsValue')]}
            // The pill rides today's bar; with nothing today it would sit on the baseline.
            highlightKey={today?.count ? today.key : undefined}
            highlightLabel={today?.count ? t('dashboard.activity.today', { n: today.count }) : undefined}
            ticks={ticks}
            max={Math.max(4, ...counts.map((c) => c.count))}
            height={176}
          />
          {status === 'ready' && total === 0 && (
            <p className="mt-3 text-xs text-muted">{t('dashboard.activity.empty')}</p>
          )}
        </div>
      )}
    </Card>
  );
}
