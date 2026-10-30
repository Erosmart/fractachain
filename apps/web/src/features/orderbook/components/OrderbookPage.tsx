import { useRef, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import RequireOnboarding from '@/components/guards/RequireOnboarding';
import { withIsland } from '@/components/island/withIsland';
import { EmptyState, PillTabs } from '@/components/ui/kit';
import { useI18n } from '@/hooks/useI18n';
import { useOrderBook } from '../hooks/useOrderBook';
import type { TakenLevel } from '../model';
import BookSummaryCard from './BookSummaryCard';
import DepthCard from './DepthCard';
import MyOrdersCard from './MyOrdersCard';
import OrderForm, { type OrderFormHandle } from './OrderForm';
import TradesCard from './TradesCard';

/** Secondary market: Stellar DEX book when the listing trades there, demo matcher otherwise. */
function Orderbook() {
  const { t } = useI18n();
  const state = useOrderBook();
  const { markets, listingId, selectMarket, book, onSdex } = state;
  const form = useRef<OrderFormHandle>(null);
  const [taken, setTaken] = useState<TakenLevel | null>(null);

  if (markets === null) {
    return (
      <p className="py-16 text-center text-sm text-muted" role="status">
        {t('markets.orderbook.loading')}
      </p>
    );
  }
  if (markets.length === 0) {
    return (
      <div className="card">
        <EmptyState
          title={t('markets.orderbook.noMarkets')}
          body={t('markets.orderbook.noMarketsBody')}
          action={
            <a href="/market" className="btn btn-primary btn-sm">
              {t('markets.orderbook.goOfferings')}
            </a>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <PillTabs
          label={t('markets.orderbook.pickMarket')}
          active={listingId}
          onChange={selectMarket}
          items={markets.map((m) => ({ key: m.listingId, label: `${m.tokenTicker} / USDC` }))}
        />
        {book && (
          <p className="flex max-w-xl items-start gap-2 text-xs text-ink-2">
            <span className={`chip shrink-0 ${onSdex ? 'chip-sky' : 'chip-neutral'}`}>
              <ShieldCheck className="h-3 w-3" aria-hidden="true" />
              {onSdex ? t('markets.orderbook.venueSdex') : t('markets.orderbook.venueLocal')}
            </span>
            <span className="pt-0.5">
              {onSdex ? t('markets.orderbook.venueSdexHint') : t('markets.orderbook.venueLocalHint')}
            </span>
          </p>
        )}
      </div>

      {!book ? (
        <p className="py-16 text-center text-sm text-muted" role="status">
          {t('markets.orderbook.loading')}
        </p>
      ) : (
        // Phones: one column ordered summary → ticket → book → orders → trades
        // (`contents` lets both columns' cards join the outer grid).
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div className="contents lg:block lg:min-w-0 lg:space-y-5">
            <div className="order-1 min-w-0 lg:order-none">
              <BookSummaryCard book={book} />
            </div>
            <div className="order-3 min-w-0 lg:order-none">
              <DepthCard
                book={book}
                taken={taken}
                onTake={(from, level) => form.current?.take(from, level)}
              />
            </div>
            <div className="order-5 min-w-0 lg:order-none">
              <TradesCard book={book} />
            </div>
          </div>
          <div className="contents lg:sticky lg:top-24 lg:block lg:min-w-0 lg:space-y-5 lg:self-start">
            <div className="order-2 min-w-0 lg:order-none">
              {/* Remount per market so the ticket starts at that market's last price. */}
              <OrderForm key={book.listingId} ref={form} state={state} onTaken={setTaken} />
            </div>
            <div className="order-4 min-w-0 lg:order-none">
              <MyOrdersCard state={state} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function OrderbookPage() {
  return (
    <RequireOnboarding>
      <Orderbook />
    </RequireOnboarding>
  );
}

export default withIsland(OrderbookPage);
