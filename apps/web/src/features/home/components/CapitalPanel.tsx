import { ArrowUpRight, Layers } from 'lucide-react';
import { Gauge, GradientPanel, PanelNote, Stat, StatGrid } from '@/components/ui/kit';
import type { Portfolio, Position } from '@/core/api/types';
import { useI18n } from '@/hooks/useI18n';
import { clock, money, pct, signed, signedPct } from '@/features/portfolio/model/format';
import type { Totals } from '@/features/portfolio/model/positions';
import { dominantSource, newestQuote } from '@/features/portfolio/model/positions';

export interface NextStep {
  label: string;
  href: string;
}

/**
 * The right-hand gradient panel: capital in tokens vs. cash as a gauge, a
 * 2×2 of balances, the price of each token (latest quote highlighted) and the
 * next step at the bottom.
 */
export function CapitalPanel({
  book,
  positions,
  totals,
  loadedAt,
  next,
  className = '',
}: {
  book: Portfolio | null;
  positions: Position[];
  totals: Totals;
  loadedAt: Date | null;
  next: NextStep;
  className?: string;
}) {
  const { t, locale } = useI18n();
  const cash = book?.usdcOnChain;
  const capital = totals.marketValue + (cash ?? 0);
  const ratio = capital > 0 ? totals.marketValue / capital : 0;
  const source = dominantSource(positions);
  const newest = newestQuote(positions);
  const pnlTone = totals.pnl > 0 ? 'good' : totals.pnl < 0 ? 'bad' : 'neutral';

  return (
    <GradientPanel
      className={className}
      title={t('dashboard.panel.title')}
      subtitle={
        source && loadedAt
          ? t('dashboard.panel.subtitle', { source: source.toLowerCase(), time: clock(loadedAt, locale) })
          : t('dashboard.panel.subtitleNoTime')
      }
      href="/portfolio"
      hrefLabel={t('dashboard.holdings.viewAll')}
      footer={
        <PanelNote
          icon={
            next.href === '/market' ? <Layers className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />
          }
          href={next.href}
        >
          {next.label}
        </PanelNote>
      }
    >
      <div className="px-5 pt-2 sm:px-6">
        <Gauge
          className="max-w-[260px] lg:max-w-[300px]"
          value={totals.marketValue}
          max={capital > 0 ? capital : 1}
          display={book ? money(totals.marketValue, 0) : '—'}
          caption={book ? t('dashboard.panel.gaugeCaption', { pct: pct(ratio) }) : undefined}
          minLabel="0"
          maxLabel={book ? money(capital, 0) : ''}
          ariaLabel={t('dashboard.panel.gaugeAria', {
            value: money(totals.marketValue),
            pct: pct(ratio),
            total: money(capital),
          })}
        />
      </div>

      <StatGrid className="mt-2 border-t border-ink/10">
        <Stat
          label={t('dashboard.panel.cash')}
          value={cash === undefined ? '—' : money(cash, 0)}
          unit={cash === undefined ? undefined : 'USDC'}
          delta={t('dashboard.panel.cashNote')}
        />
        <Stat
          label={t('dashboard.panel.result')}
          value={signed(totals.pnl, 0)}
          unit="USDC"
          delta={signedPct(totals.pnlPct)}
          deltaTone={pnlTone}
        />
        <Stat
          label={t('dashboard.panel.xlm')}
          value={book?.xlmOnChain === undefined ? '—' : money(book.xlmOnChain, 0)}
          unit={book?.xlmOnChain === undefined ? undefined : 'XLM'}
          delta={t('dashboard.panel.xlmNote')}
        />
        <Stat
          label={t('dashboard.panel.dividends')}
          value={money(totals.pendingDividends, 0)}
          unit="USDC"
          delta={t('dashboard.panel.dividendsNote')}
        />
      </StatGrid>

      {positions.length > 0 && (
        <div className="hidden border-t border-ink/10 px-5 py-5 sm:px-6 lg:block">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h3 className="text-[13px] font-medium text-ink">{t('dashboard.panel.pricesTitle')}</h3>
            <span className="text-[11px] text-ink-2">
              {t('dashboard.panel.pricesUnit')}
              {newest ? ` · ${clock(newest.at, locale)}` : ''}
            </span>
          </div>
          <ul className="grid grid-cols-3 gap-x-3 gap-y-3">
            {positions.slice(0, 9).map((p) => {
              const latest = newest?.listingId === p.listingId && positions.length > 1;
              return (
                <li key={p.listingId} className="min-w-0">
                  <span className="block truncate text-[11px] text-ink-2">{p.tokenTicker}</span>
                  <span
                    className={`mt-0.5 inline-block text-[15px] tnum ${
                      latest ? 'rounded-md bg-surface px-1.5 font-medium text-ink shadow-card' : 'text-ink'
                    }`}
                  >
                    {p.marketPrice > 0 ? money(p.marketPrice) : '—'}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </GradientPanel>
  );
}
