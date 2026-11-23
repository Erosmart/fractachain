import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { Card } from '@/components/ui/kit';
import { formatAmount } from '@/core/format/number';
import { money } from '@/core/market/money';
import { useI18n } from '@/hooks/useI18n';
import type { Book } from '../model';
import PriceCandles from './PriceCandles';

/** Last price as the hero figure, its move against the issue price, and the candles. */
export default function BookSummaryCard({ book }: { book: Book }) {
  const { t } = useI18n();
  const change = book.refPrice > 0 ? ((book.lastPrice - book.refPrice) / book.refPrice) * 100 : 0;
  const flat = Math.abs(change) < 0.005;
  const Icon = flat ? Minus : change > 0 ? ArrowUpRight : ArrowDownRight;
  const tone = flat ? 'text-ink-2' : change > 0 ? 'text-good' : 'text-bad';
  return (
    <Card
      title={`${book.tokenTicker} · ${book.legalName}`}
      subtitle={t('markets.candles.subtitle')}
      bodyClassName="space-y-5"
    >
      <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
        <div>
          <p className="eyebrow">{t('markets.orderbook.last')}</p>
          <p className="mt-1.5 flex items-baseline gap-1.5 text-ink">
            <span className="text-sm text-ink-2">US$</span>
            <span className="numeral text-[52px]">{formatAmount(book.lastPrice, 2)}</span>
          </p>
          <p className={`mt-1 flex items-center gap-1 text-xs font-medium tnum ${tone}`}>
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            {change > 0 ? '+' : ''}
            {formatAmount(change, 2)} %{' '}
            <span className="font-normal text-muted">{t('markets.orderbook.vsRef')}</span>
          </p>
        </div>
        <dl className="flex gap-8 pb-1 text-sm">
          <div>
            <dt className="eyebrow">{t('markets.orderbook.ref')}</dt>
            <dd className="mt-1 text-ink tnum">{money(book.refPrice, 'USDC', 2)}</dd>
          </div>
          <div>
            <dt className="eyebrow">{t('markets.orderbook.spread')}</dt>
            <dd className="mt-1 text-ink tnum">
              {book.spread != null ? money(book.spread, 'USDC', 2) : '—'}
            </dd>
          </div>
        </dl>
      </div>
      <PriceCandles trades={book.trades} refPrice={book.refPrice} code={book.tokenTicker} />
    </Card>
  );
}
