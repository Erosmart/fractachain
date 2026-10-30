import { ListOrdered } from 'lucide-react';
import { Card, EmptyState, StatusChip } from '@/components/ui/kit';
import { container } from '@/core/container';
import { useI18n } from '@/hooks/useI18n';
import { useOpenOrders } from '../hooks/useMarketContext';
import { amount, money } from '../model/format';

/** Resting orders in the book for the assets the investor holds, with cancel. */
export function OpenOrdersCard({
  listingIds,
  run,
  busy,
}: {
  listingIds: string[];
  run: (key: string, fn: () => Promise<unknown>) => Promise<void>;
  busy: string | null;
}) {
  const { t } = useI18n();
  const { orders, reload } = useOpenOrders(listingIds);

  const cancel = (id: string) =>
    run(`cancel-${id}`, async () => {
      await container.api.market.cancelSandboxOrder(id);
      reload();
    });

  return (
    <Card
      title={t('dashboard.portfolio.ordersTitle')}
      subtitle={t('dashboard.portfolio.ordersSub')}
      href="/orderbook"
      hrefLabel={t('nav.orderbook')}
    >
      {orders === null ? (
        <p className="py-6 text-center text-sm text-muted">{t('auth.loading')}</p>
      ) : orders.length === 0 ? (
        <EmptyState
          icon={<ListOrdered className="h-5 w-5" />}
          title={t('dashboard.portfolio.ordersEmpty')}
          className="!py-6"
        />
      ) : (
        <ul className="divide-y divide-line/70">
          {orders.map((o) => {
            const side =
              o.side === 'BUY' ? t('dashboard.portfolio.orderBuy') : t('dashboard.portfolio.orderSell');
            return (
              <li
                key={o.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3 first:pt-0 last:pb-0"
              >
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="font-medium text-ink">{o.tokenTicker}</span>
                    <StatusChip tone={o.side === 'BUY' ? 'good' : 'peach'} icon={false}>
                      {side}
                    </StatusChip>
                    <StatusChip tone={o.status === 'PARTIAL' ? 'sky' : 'neutral'}>
                      {o.status === 'PARTIAL'
                        ? t('dashboard.portfolio.orderPartial')
                        : t('dashboard.portfolio.orderPending')}
                    </StatusChip>
                  </span>
                  <span className="mt-0.5 block text-xs text-muted tnum">
                    {t('dashboard.portfolio.orderPrice')} {money(o.price)} ·{' '}
                    {t('dashboard.portfolio.orderRemaining')} {amount(o.remaining)}
                  </span>
                </span>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  disabled={busy === `cancel-${o.id}`}
                  onClick={() => void cancel(o.id)}
                  aria-label={t('dashboard.portfolio.cancelAria', {
                    side: side.toLowerCase(),
                    ticker: o.tokenTicker,
                  })}
                >
                  {t('dashboard.portfolio.cancel')}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
