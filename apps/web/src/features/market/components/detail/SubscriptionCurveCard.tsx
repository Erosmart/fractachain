import { useMemo } from 'react';
import { Card, DenseBars, EmptyState } from '@/components/ui/kit';
import type { ListingActivity } from '@/core/api/ListingsApi';
import type { ListingDetail } from '@/core/api/types';
import { useI18n } from '@/hooks/useI18n';
import { assetAmount } from '@/components/tx/format';
import { subscriptionCurve } from '../../model';

/**
 * Cumulative raise per day with the minimum as a dashed threshold. Only
 * logged contributions are plotted; money raised before dates were logged is
 * the starting base and said so in a note.
 */
export default function SubscriptionCurveCard({
  listing,
  activity,
  code,
  softCap,
  hardCap,
  live,
  deadlineMs,
}: {
  listing: ListingDetail;
  activity: ListingActivity | null;
  code: string;
  /** Read from the contract; null hides the threshold line. */
  softCap: number | null;
  hardCap: number | null;
  /** Still raising: an empty curve is worth an empty state; a closed one without dates is hidden. */
  live: boolean;
  deadlineMs: number | null;
}) {
  const { t, locale } = useI18n();
  const closedAt = listing.closedAt ? new Date(listing.closedAt).getTime() : null;
  const until = closedAt ?? Date.now();
  const points = useMemo(
    () => (activity ? subscriptionCurve(activity.daily, { undated: activity.undatedUsdc, until }) : []),
    [activity, until],
  );
  if (!activity || (points.length === 0 && !live)) return null;

  // While raising, the days left until the deadline show as empty slots.
  const future: string[] = [];
  if (live && deadlineMs && points.length) {
    const lastMs = Date.parse(`${points[points.length - 1].date}T00:00:00Z`);
    for (
      let t = lastMs + 86_400_000;
      t <= deadlineMs && points.length + future.length < 60;
      t += 86_400_000
    ) {
      future.push(new Date(t).toISOString().slice(0, 10));
    }
  }
  const slots = [
    ...points.map((p) => ({ date: p.date, value: p.cumulative as number | null })),
    ...future.map((date) => ({ date, value: null })),
  ];

  const fmt = (n: number) => assetAmount(n, code);
  const loc = locale === 'en' ? 'en-US' : 'es-AR';
  const dayLabel = (date: string, long = false) =>
    new Date(`${date}T12:00:00Z`).toLocaleDateString(
      loc,
      long ? { day: 'numeric', month: 'short', year: 'numeric' } : { day: 'numeric', month: 'short' },
    );
  const last = points[points.length - 1];
  const isToday = last && !closedAt && last.date === new Date().toISOString().slice(0, 10);
  const tickIdx = slots.length <= 1 ? [0] : [0, Math.floor((slots.length - 1) / 2), slots.length - 1];

  return (
    <Card title={t('offerings.curve.title')} subtitle={t('offerings.curve.subtitle')}>
      {points.length === 0 ? (
        <EmptyState
          title={t('offerings.curve.empty')}
          body={
            activity.undatedUsdc > 0
              ? t('offerings.curve.undated', { n: fmt(activity.undatedUsdc) })
              : t('offerings.curve.emptyBody')
          }
          className="py-6"
        />
      ) : (
        <>
          <DenseBars
            data={slots.map((p) => ({ key: p.date, label: dayLabel(p.date, true), value: p.value }))}
            format={fmt}
            summary={t('offerings.curve.summary', { total: fmt(last.cumulative), n: points.length })}
            columns={[t('offerings.curve.colDay'), t('offerings.curve.colRaised')]}
            reference={
              softCap && softCap > 0
                ? {
                    value: softCap,
                    label: t('offerings.curve.reference', { n: fmt(softCap) }),
                  }
                : undefined
            }
            max={hardCap ?? undefined}
            highlightKey={last.date}
            highlightLabel={`${fmt(last.cumulative)} · ${isToday ? t('offerings.curve.today') : t('offerings.curve.last')}`}
            ticks={[...new Set(tickIdx)].map((i) => ({ index: i, label: dayLabel(slots[i].date) }))}
          />
          {activity.undatedUsdc > 0 && (
            <p className="mt-3 text-xs text-muted">
              {t('offerings.curve.undated', { n: fmt(activity.undatedUsdc) })}
            </p>
          )}
        </>
      )}
    </Card>
  );
}
