import { Card, EmptyState } from '@/components/ui/kit';
import { qty } from '@/core/market/money';
import { useI18n } from '@/hooks/useI18n';
import type { Book } from '../model';

const short = (id?: string) => (id ? `${id.slice(0, 4)}…${id.slice(-4)}` : '—');

/** Last 20 prints: time, price, size and the (abbreviated) counterparties. */
export default function TradesCard({ book }: { book: Book }) {
  const { t, locale } = useI18n();
  const time = (iso: string) =>
    new Date(iso).toLocaleString(locale === 'en' ? 'en-US' : 'es-AR', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  return (
    <Card title={t('markets.orderbook.trades')}>
      {book.trades.length === 0 ? (
        <EmptyState title={t('markets.orderbook.noTrades')} className="py-6" />
      ) : (
        <div className="-mx-2 overflow-x-auto">
          <table className="table-clean min-w-[30rem]">
            <thead>
              <tr>
                <th scope="col">{t('markets.orderbook.time')}</th>
                <th scope="col" className="!text-right">
                  {t('markets.orderbook.price')}
                </th>
                <th scope="col" className="!text-right">
                  {t('markets.orderbook.qty')}
                </th>
                <th scope="col" className="!text-right">
                  {t('markets.orderbook.buyer')}
                </th>
                <th scope="col" className="!text-right">
                  {t('markets.orderbook.seller')}
                </th>
              </tr>
            </thead>
            <tbody>
              {book.trades.slice(0, 20).map((tr) => (
                <tr key={tr.id}>
                  <td className="whitespace-nowrap text-ink-2">{time(tr.createdAt)}</td>
                  <td className="text-right font-medium">
                    {tr.price.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    {tr.legacy && (
                      <span className="chip chip-warn ml-1.5 h-4 px-1.5 text-[10px]">
                        {t('markets.orderbook.legacy')}
                      </span>
                    )}
                  </td>
                  <td className="text-right">{qty(tr.amount)}</td>
                  <td className="text-right font-mono text-xs text-ink-2" title={tr.buyer}>
                    {short(tr.buyer)}
                  </td>
                  <td className="text-right font-mono text-xs text-ink-2" title={tr.seller}>
                    {short(tr.seller)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
