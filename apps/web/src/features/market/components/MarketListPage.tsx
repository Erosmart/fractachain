import { useCallback, useEffect, useMemo, useState } from 'react';
import { Info, RotateCw } from 'lucide-react';
import { withIsland } from '@/components/island/withIsland';
import { EmptyState, PageHeader, PillTabs } from '@/components/ui/kit';
import type { Pool } from '@/core/api/types';
import { container } from '@/core/container';
import { isVisibleListing } from '@/core/market/listings';
import { useI18n } from '@/hooks/useI18n';
import { LIVE_PHASES, poolPhase, type OfferingPhase } from '../model';
import OfferingCard from './OfferingCard';

type Filter = 'all' | 'open' | 'upcoming' | 'closed';

const matches = (filter: Filter, phase: OfferingPhase) =>
  filter === 'all' ||
  (filter === 'open' && LIVE_PHASES.has(phase)) ||
  (filter === 'upcoming' && phase === 'upcoming') ||
  (filter === 'closed' && !LIVE_PHASES.has(phase) && phase !== 'upcoming');

/** Public catalog of primary offerings, open ones first. */
function MarketListPage() {
  const { t } = useI18n();
  const [pools, setPools] = useState<Pool[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [filter, setFilter] = useState<Filter | null>(null);
  const [sector, setSector] = useState('all');

  const load = useCallback(() => {
    setFailed(false);
    container.api.listings
      .pools()
      .then((rows) => setPools(rows.filter((p) => isVisibleListing(p.id))))
      .catch(() => {
        setFailed(true);
        setPools((prev) => prev ?? []);
      });
  }, []);

  useEffect(load, [load]);

  const rows = useMemo(() => {
    const now = Date.now();
    const order = (p: OfferingPhase) => (LIVE_PHASES.has(p) ? 0 : p === 'upcoming' ? 1 : 2);
    return (pools ?? [])
      .map((pool) => ({ pool, phase: poolPhase(pool, now) }))
      .sort((a, b) => order(a.phase) - order(b.phase) || a.pool.daysRemaining - b.pool.daysRemaining);
  }, [pools]);

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: rows.length, open: 0, upcoming: 0, closed: 0 };
    for (const r of rows)
      for (const f of ['open', 'upcoming', 'closed'] as const) if (matches(f, r.phase)) c[f] += 1;
    return c;
  }, [rows]);

  // Open offerings first when there are any; otherwise everything.
  const active: Filter = filter ?? (counts.open > 0 ? 'open' : 'all');
  const sectors = useMemo(
    () =>
      [...new Set(rows.map((r) => r.pool.commodityType).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [rows],
  );
  const visible = rows.filter(
    (r) => matches(active, r.phase) && (sector === 'all' || r.pool.commodityType === sector),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t('offerings.kicker')}
        title={t('offerings.title')}
        subtitle={t('offerings.subtitle')}
        actions={
          pools && (
            <span className="chip chip-neutral tnum">
              {t(counts.all === 1 ? 'offerings.count.one' : 'offerings.count.many', { n: counts.all })}
            </span>
          )
        }
      />

      <p className="flex items-start gap-2 text-xs text-muted">
        <Info className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        {t('offerings.demoNotice')}
      </p>

      {pools && rows.length > 0 && (
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <PillTabs
            label={t('offerings.filters.label')}
            active={active}
            onChange={(k) => setFilter(k as Filter)}
            items={(['all', 'open', 'upcoming', 'closed'] as const).map((k) => ({
              key: k,
              label: t(`offerings.filters.${k}`),
              badge: k === 'all' ? undefined : counts[k] || undefined,
            }))}
          />
          {sectors.length > 1 && (
            <PillTabs
              label={t('offerings.filters.sectorLabel')}
              active={sector}
              onChange={setSector}
              items={[
                { key: 'all', label: t('offerings.filters.allSectors') },
                ...sectors.map((s) => ({ key: s, label: s })),
              ]}
            />
          )}
        </div>
      )}

      {!pools && (
        <p className="py-16 text-center text-sm text-muted" role="status">
          {t('offerings.loading')}
        </p>
      )}

      {failed && (
        <div className="card flex flex-wrap items-center justify-between gap-3 px-5 py-4" role="alert">
          <p className="text-sm text-ink">{t('offerings.error')}</p>
          <button type="button" className="btn btn-secondary btn-sm" onClick={load}>
            <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
            {t('offerings.retry')}
          </button>
        </div>
      )}

      {pools && !failed && rows.length === 0 && (
        <div className="card">
          <EmptyState title={t('offerings.empty.none')} body={t('offerings.empty.noneBody')} />
        </div>
      )}

      {rows.length > 0 && visible.length === 0 && (
        <div className="card">
          <EmptyState
            title={active === 'upcoming' ? t('offerings.empty.upcoming') : t('offerings.empty.title')}
            body={t('offerings.empty.body')}
            action={
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  setFilter('all');
                  setSector('all');
                }}
              >
                {t('offerings.filters.all')}
              </button>
            }
          />
        </div>
      )}

      {visible.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map(({ pool, phase }) => (
            <OfferingCard key={pool.id} pool={pool} phase={phase} />
          ))}
        </div>
      )}
    </div>
  );
}

export default withIsland(MarketListPage);
