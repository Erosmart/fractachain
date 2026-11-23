import { Card } from '@/components/ui/kit';
import { qty } from '@/core/market/money';
import { useI18n } from '@/hooks/useI18n';
import type { Book, Level, TakenLevel } from '../model';

const usd = (n: number) => n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function Side({
  title,
  levels,
  from,
  taken,
  empty,
  onTake,
}: {
  title: string;
  levels: Level[];
  from: 'bid' | 'ask';
  taken: TakenLevel | null;
  empty: string;
  onTake: (from: 'bid' | 'ask', level: Level) => void;
}) {
  const { t } = useI18n();
  // Categorical identity (bids vs asks), not status: data slots 1 and 2.
  const swatch = from === 'bid' ? 'bg-viz-1' : 'bg-viz-2';
  const depth = from === 'bid' ? 'bg-viz-1/15' : 'bg-viz-2/15';
  return (
    <div className="min-w-0">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-ink">
        <span className={`h-2.5 w-2.5 rounded-[3px] ${swatch}`} aria-hidden="true" />
        {title}
      </p>
      <div className="grid grid-cols-3 px-2 pb-1.5 text-[11px] text-muted">
        <span>{t('markets.orderbook.price')}</span>
        <span className="text-right">{t('markets.orderbook.qty')}</span>
        <span className="text-right">{t('markets.orderbook.total')}</span>
      </div>
      {levels.length === 0 ? (
        <p className="rounded-lg bg-surface-2 px-3 py-4 text-center text-xs text-muted">{empty}</p>
      ) : (
        <ul className="space-y-[2px]">
          {levels.map((level) => {
            const selected = taken?.from === from && taken.price === level.price;
            const label = t(from === 'bid' ? 'markets.orderbook.takeBid' : 'markets.orderbook.takeAsk', {
              p: `US$ ${usd(level.price)}`,
              n: qty(level.amount),
            });
            return (
              <li key={`${from}-${level.price}-${level.legacy ? 'l' : 'c'}`}>
                <button
                  type="button"
                  onClick={() => onTake(from, level)}
                  aria-label={label}
                  aria-pressed={selected}
                  title={label}
                  className={`relative grid w-full grid-cols-3 overflow-hidden rounded-lg px-2 py-1.5 text-left text-[13px] text-ink tnum transition-colors hover:bg-ink/[0.04] ${
                    selected ? 'ring-2 ring-inset ring-navy' : ''
                  }`}
                >
                  <span
                    className={`pointer-events-none absolute inset-y-0 right-0 rounded-l-sm ${depth}`}
                    style={{ width: `${level.depthPercent}%` }}
                    aria-hidden="true"
                  />
                  <span className="relative font-medium">
                    {usd(level.price)}
                    {level.legacy && (
                      <span className="chip chip-warn ml-1.5 h-4 px-1.5 text-[10px]">
                        {t('markets.orderbook.legacy')}
                      </span>
                    )}
                  </span>
                  <span className="relative text-right">{qty(level.amount)}</span>
                  <span className="relative text-right text-ink-2">{usd(level.total)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Bids and asks side by side; a level is a button that loads its price into the form. */
export default function DepthCard({
  book,
  taken,
  onTake,
}: {
  book: Book;
  taken: TakenLevel | null;
  onTake: (from: 'bid' | 'ask', level: Level) => void;
}) {
  const { t } = useI18n();
  // Asks arrive ascending; show the best ask first, next to the spread.
  return (
    <Card title={t('markets.orderbook.depthTitle')} subtitle={t('markets.orderbook.depthSubtitle')}>
      <div className="grid gap-6 sm:grid-cols-2">
        <Side
          title={t('markets.orderbook.bids')}
          levels={book.bids}
          from="bid"
          taken={taken}
          empty={t('markets.orderbook.noBids')}
          onTake={onTake}
        />
        <Side
          title={t('markets.orderbook.asks')}
          levels={book.asks}
          from="ask"
          taken={taken}
          empty={t('markets.orderbook.noAsks')}
          onTake={onTake}
        />
      </div>
    </Card>
  );
}
