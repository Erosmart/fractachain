import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { Card, EmptyState } from '@/components/ui/kit';
import { formatAmount, formatInt } from '@/core/format/number';
import { useI18n } from '@/hooks/useI18n';
import type { StockCustody } from '../model';

const base = (symbol: string) => (symbol.startsWith('t') ? symbol.slice(1) : symbol).slice(0, 4);

/** Selectable list of tokenized stocks (a table on wide screens, stacked rows on phones). */
export default function StockList({
  stocks,
  selected,
  onSelect,
}: {
  stocks: StockCustody[];
  selected: StockCustody | null;
  onSelect: (s: StockCustody) => void;
}) {
  const { t } = useI18n();
  return (
    <Card title={t('markets.stocks.list')} subtitle={t('markets.stocks.listSub', { n: stocks.length })}>
      {stocks.length === 0 ? (
        <EmptyState title={t('markets.stocks.empty')} className="py-6" />
      ) : (
        <>
          <div className="hidden grid-cols-[minmax(0,1fr)_7rem_6rem_7rem] gap-3 px-3 pb-2 text-[11px] text-muted sm:grid">
            <span>{t('markets.stocks.colAsset')}</span>
            <span className="text-right">{t('markets.stocks.colPrice')}</span>
            <span className="text-right">{t('markets.stocks.colChange')}</span>
            <span className="text-right">{t('markets.stocks.colCustody')}</span>
          </div>
          <ul className="space-y-1">
            {stocks.map((s) => {
              const on = selected?.symbol === s.symbol;
              const up = s.change24h >= 0;
              const Arrow = up ? ArrowUpRight : ArrowDownRight;
              return (
                <li key={s.symbol}>
                  <button
                    type="button"
                    aria-pressed={on}
                    aria-label={t('markets.stocks.select', { sym: s.symbol })}
                    onClick={() => onSelect(s)}
                    className={`grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 rounded-2xl px-3 py-3 text-left transition-colors sm:grid-cols-[minmax(0,1fr)_7rem_6rem_7rem] ${
                      on ? 'bg-sky-soft ring-1 ring-inset ring-sky/60' : 'hover:bg-ink/[0.03]'
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <span
                        className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl text-[11px] font-semibold tracking-wide ${
                          on ? 'bg-navy text-navy-ink' : 'bg-surface-2 text-ink ring-1 ring-line'
                        }`}
                        aria-hidden="true"
                      >
                        {base(s.symbol)}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-ink">
                          {s.symbol} <span className="font-normal text-muted">· {s.tickerMerval}</span>
                        </span>
                        <span className="block truncate text-xs text-ink-2">{s.companyName}</span>
                      </span>
                    </span>
                    <span className="text-right text-sm font-medium text-ink tnum">
                      US$ {formatAmount(s.priceUsd, 2)}
                    </span>
                    <span
                      className={`col-start-2 row-start-2 flex items-center justify-end gap-0.5 text-xs font-medium tnum sm:col-start-auto sm:row-start-auto ${
                        up ? 'text-good' : 'text-bad'
                      }`}
                    >
                      <Arrow className="h-3.5 w-3.5" aria-hidden="true" />
                      {up ? '+' : ''}
                      {formatAmount(s.change24h, 1)} %
                    </span>
                    <span className="hidden text-right text-xs text-ink-2 tnum sm:block">
                      {formatInt(s.totalSharesInCustody)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Card>
  );
}
