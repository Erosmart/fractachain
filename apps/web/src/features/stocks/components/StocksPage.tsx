import { useEffect, useState } from 'react';
import { Coins } from 'lucide-react';
import RequireOnboarding from '@/components/guards/RequireOnboarding';
import { withIsland } from '@/components/island/withIsland';
import LiveContractLink from '@/components/ui/LiveContractLink';
import MockDisclaimer from '@/components/ui/MockDisclaimer';
import { Card } from '@/components/ui/kit';
import { container } from '@/core/container';
import { useI18n } from '@/hooks/useI18n';
import { DEFAULT_STOCKS, normalizeStock, type StockCustody } from '../model';
import ReserveProof from './ReserveProof';
import StockList from './StockList';
import TradeSimulator from './TradeSimulator';

/** Tokenized Merval stocks: list, proof of reserve and a simulated ticket. */
function Stocks() {
  const { t } = useI18n();
  const [stocks, setStocks] = useState<StockCustody[]>(DEFAULT_STOCKS);
  const [selected, setSelected] = useState<StockCustody | null>(DEFAULT_STOCKS[0]);

  useEffect(() => {
    container.api.custody
      .stocks()
      .then((rows) => {
        if (!rows) return;
        const mapped = rows.map(normalizeStock).filter((s): s is StockCustody => Boolean(s));
        // An empty list is a real answer (the admin deactivated everything);
        // only a failed request falls back to the built-in catalog.
        setStocks(mapped);
        setSelected(mapped[0] ?? null);
      })
      .catch(() => undefined);
  }, []);

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <MockDisclaimer product="Merval" />
        <LiveContractLink kind="stockVault" />
      </div>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="min-w-0 space-y-5">
          <StockList stocks={stocks} selected={selected} onSelect={setSelected} />
          <div className="grid items-start gap-5 xl:grid-cols-2">
            <TradeSimulator stock={selected} />
            <Card title={t('markets.stocks.dividends.title')}>
              <p className="text-[13px] leading-relaxed text-ink-2">{t('markets.stocks.dividends.body')}</p>
              <div className="mt-4 flex items-center gap-3 rounded-2xl bg-surface-2 p-4">
                <span
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-butter-soft text-ink"
                  aria-hidden="true"
                >
                  <Coins className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs text-muted">{t('markets.stocks.dividends.last')}</p>
                  <p className="text-sm font-medium text-ink tnum">{t('markets.stocks.dividends.value')}</p>
                </div>
              </div>
            </Card>
          </div>
        </div>
        <div className="order-first min-w-0 lg:order-none lg:sticky lg:top-24 lg:self-start">
          <ReserveProof stock={selected} />
        </div>
      </div>
    </div>
  );
}

function StocksPage() {
  return (
    <RequireOnboarding>
      <Stocks />
    </RequireOnboarding>
  );
}

export default withIsland(StocksPage);
