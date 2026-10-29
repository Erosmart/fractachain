import { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { withIsland } from '@/components/island/withIsland';
import type { Pool } from '@/core/api/types';
import { container } from '@/core/container';
import { formatInt } from '@/core/format/number';
import { isVisibleListing } from '@/core/market/listings';
import { useI18n } from '@/hooks/useI18n';

/** Public catalog of primary offerings. */
function MarketListPage() {
  const [pools, setPools] = useState<Pool[]>([]);
  const [loading, setLoading] = useState(true);
  const { t } = useI18n();

  useEffect(() => {
    let alive = true;
    container.api.listings
      .pools()
      .then((rows) => alive && setPools(rows.filter((p) => isVisibleListing(p.id))))
      .catch(() => alive && setPools([]))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  const openCount = pools.filter((p) => p.status === 'OPEN').length;

  return (
    <div className="space-y-8 py-6">
      <div className="rounded-2xl border border-amber-300/80 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        {t('market.honestyBanner')}
      </div>
      <div>
        <p className="font-lcd text-[11px] uppercase tracking-[0.2em] text-neutral-500">
          {t('market.kicker')}
        </p>
        <h1 className="text-2xl sm:text-3xl font-extrabold font-display">{t('market.title')}</h1>
        <p className="text-neutral-600 max-w-xl mt-1">
          {t(openCount === 1 ? 'market.openOne' : 'market.openMany', { n: openCount })}
        </p>
        <p className="text-xs text-neutral-500 mt-2">{t('market.live')}</p>
      </div>
      {loading && <p className="text-sm text-neutral-500">{t('market.loading')}</p>}
      {!loading && pools.length === 0 && <p className="text-sm text-neutral-500">{t('market.empty')}</p>}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {pools.map((pool) => {
          const progress =
            pool.hardCap > 0 ? Math.min(100, Math.round((pool.raisedAmount / pool.hardCap) * 100)) : 0;
          const unit = pool.paymentKind === 'XLM' ? 'XLM' : 'USDC';
          return (
            <article key={pool.id} className="p-6 rounded-3xl crystal-card space-y-4 flex flex-col">
              <div className="flex justify-between gap-2">
                <span className="text-xs font-lcd text-[#3f8f38]">{pool.tna}% TNA USD</span>
                <span className="text-[10px] uppercase text-neutral-500">{pool.status}</span>
              </div>
              <h2 className="font-section text-xl font-extrabold leading-tight">{pool.title}</h2>
              <p className="text-sm text-neutral-600">{pool.producerName}</p>
              {pool.tokenTicker && (
                <p className="text-xs font-mono">
                  Token {pool.tokenTicker} · ISIN {pool.isin}
                </p>
              )}
              <div
                className="h-2 rounded-full bg-black/5 overflow-hidden"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progress}
              >
                <div className="h-full bg-black" style={{ width: `${progress}%` }} />
              </div>
              <p className="text-xs text-neutral-500">
                {formatInt(pool.raisedAmount)} / {formatInt(pool.hardCap)} {unit}
                {pool.minInvestment ? ` · ${t('market.min')} ${formatInt(pool.minInvestment)} ${unit}` : ''}
              </p>
              <a
                href={`/market/${encodeURIComponent(pool.id)}`}
                className="inline-flex items-center gap-2 text-sm font-display font-bold pt-2"
              >
                {t('market.viewDossier')} <ArrowRight className="w-4 h-4" />
              </a>
            </article>
          );
        })}
      </div>
    </div>
  );
}

export default withIsland(MarketListPage);
