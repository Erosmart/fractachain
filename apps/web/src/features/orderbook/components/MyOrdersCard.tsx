import { Card, StatusChip } from '@/components/ui/kit';
import { money, qty } from '@/core/market/money';
import { useI18n } from '@/hooks/useI18n';
import type { OrderBookState } from '../hooks/useOrderBook';

/** Resting orders with their state and a cancel action each. */
export default function MyOrdersCard({ state }: { state: OrderBookState }) {
  const { t } = useI18n();
  const { openOrders, busy, actions } = state;
  return (
    <Card title={t('markets.orders.title')}>
      {openOrders.length === 0 ? (
        <p className="text-sm text-muted">{t('markets.orders.empty')}</p>
      ) : (
        <ul className="divide-y divide-line/70">
          {openOrders.map((o) => {
            const sideLabel = o.side === 'BUY' ? t('markets.orders.buy') : t('markets.orders.sell');
            return (
              <li key={o.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink tnum">
                    {sideLabel} · {qty(o.remaining)} @ {money(o.price, 'USDC', 2)}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    <StatusChip tone={o.status === 'PARTIAL' ? 'sky' : 'neutral'}>
                      {t(`markets.orders.status.${o.status === 'PARTIAL' ? 'PARTIAL' : 'OPEN'}`)}
                    </StatusChip>
                    {o.legacy && <StatusChip tone="warn">{t('markets.orderbook.legacy')}</StatusChip>}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={busy}
                  aria-label={t('markets.orders.cancelAria', {
                    side: sideLabel.toLowerCase(),
                    n: qty(o.remaining),
                    p: money(o.price, 'USDC', 2),
                  })}
                  onClick={() => void actions.cancel(o)}
                >
                  {t('markets.orders.cancel')}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
