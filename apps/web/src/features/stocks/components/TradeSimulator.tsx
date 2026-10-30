import { useEffect, useId, useState } from 'react';
import { Building2 } from 'lucide-react';
import { Card, Notice, PillTabs } from '@/components/ui/kit';
import { formatAmount } from '@/core/format/number';
import { useI18n } from '@/hooks/useI18n';
import type { StockCustody } from '../model';

/** Simulated trading ticket for a tokenized stock, plus the (simulated) de-tokenization request. */
export default function TradeSimulator({ stock }: { stock: StockCustody | null }) {
  const { t } = useI18n();
  const ids = { qty: useId(), alyc: useId() };
  const [side, setSide] = useState<'BUY' | 'SELL'>('BUY');
  const [qtyStr, setQtyStr] = useState('10');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [destokOpen, setDestokOpen] = useState(false);
  const [destokDone, setDestokDone] = useState(false);
  const [alyc, setAlyc] = useState('');
  const n = Math.max(0, Math.floor(Number(qtyStr) || 0));
  const subtotal = n * (stock?.priceUsd ?? 0);
  const fee = subtotal * 0.001;
  const sym = stock?.symbol ?? '';
  const usd = (v: number) => `US$ ${formatAmount(v, 2)}`;

  useEffect(() => setResult(null), [stock?.symbol]);

  const simulate = () => {
    if (!stock || n <= 0) return;
    setBusy(true);
    setResult(null);
    window.setTimeout(() => {
      setBusy(false);
      setResult(
        t('markets.stocks.terminal.done', {
          side: side === 'BUY' ? t('markets.stocks.terminal.sideBuy') : t('markets.stocks.terminal.sideSell'),
          n,
          sym,
        }),
      );
    }, 900);
  };

  return (
    <Card
      title={t('markets.stocks.terminal.title', { sym })}
      subtitle={t('markets.stocks.terminal.subtitle')}
      actions={<span className="chip chip-butter">{t('markets.simulator')}</span>}
      bodyClassName="space-y-4"
    >
      <PillTabs
        label={t('markets.form.side')}
        active={side}
        onChange={(k) => setSide(k as 'BUY' | 'SELL')}
        className="w-full [&>button]:flex-1 [&>button]:justify-center"
        items={[
          { key: 'BUY', label: t('markets.stocks.terminal.buy') },
          { key: 'SELL', label: t('markets.stocks.terminal.sell') },
        ]}
      />
      <div>
        <label htmlFor={ids.qty} className="label">
          {t('markets.stocks.terminal.qty')}
        </label>
        <input
          id={ids.qty}
          className="input tnum"
          type="text"
          inputMode="numeric"
          value={qtyStr}
          onChange={(e) => setQtyStr(e.target.value.replace(/[^\d]/g, ''))}
          onFocus={(e) => e.target.select()}
        />
      </div>
      <dl className="space-y-1.5 rounded-xl bg-surface-2 px-3.5 py-3 text-[13px]">
        <div className="flex justify-between">
          <dt className="text-ink-2">{t('markets.stocks.terminal.unitPrice')}</dt>
          <dd className="text-ink tnum">{usd(stock?.priceUsd ?? 0)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-ink-2">{t('markets.stocks.terminal.fee')}</dt>
          <dd className="text-ink tnum">{usd(fee)}</dd>
        </div>
        <div className="flex justify-between border-t border-line pt-1.5">
          <dt className="font-medium text-ink">{t('markets.stocks.terminal.total')}</dt>
          <dd className="font-medium text-ink tnum">
            {usd(side === 'BUY' ? subtotal + fee : subtotal - fee)}
          </dd>
        </div>
      </dl>
      <button
        type="button"
        className="btn btn-primary btn-lg w-full"
        disabled={busy || !stock || n <= 0}
        onClick={simulate}
      >
        {busy
          ? t('markets.stocks.terminal.simulating')
          : t(side === 'BUY' ? 'markets.stocks.terminal.submitBuy' : 'markets.stocks.terminal.submitSell', {
              n,
              sym,
            })}
      </button>
      <div aria-live="polite">{result && <Notice tone="good">{result}</Notice>}</div>

      <div className="border-t border-line pt-4">
        <button
          type="button"
          className="btn btn-ghost btn-sm -ml-3"
          aria-expanded={destokOpen}
          onClick={() => {
            setDestokOpen((v) => !v);
            setDestokDone(false);
          }}
        >
          <Building2 className="h-4 w-4" aria-hidden="true" />
          {t('markets.stocks.destok.open')}
        </button>
        {destokOpen && (
          <div className="mt-3 space-y-3 rounded-2xl bg-butter-soft p-4">
            <p className="text-sm font-medium text-ink">{t('markets.stocks.destok.title')}</p>
            <p className="text-[13px] leading-relaxed text-ink-2">{t('markets.stocks.destok.body')}</p>
            <div>
              <label htmlFor={ids.alyc} className="label">
                {t('markets.stocks.destok.account')}
              </label>
              <input
                id={ids.alyc}
                className="input"
                value={alyc}
                placeholder={t('markets.stocks.destok.placeholder')}
                onChange={(e) => setAlyc(e.target.value)}
              />
            </div>
            <button
              type="button"
              className="btn btn-secondary w-full"
              disabled={!alyc.trim()}
              onClick={() => {
                setDestokDone(true);
                setDestokOpen(false);
              }}
            >
              {t('markets.stocks.destok.submit')}
            </button>
          </div>
        )}
        <div aria-live="polite">
          {destokDone && (
            <Notice tone="good" className="mt-3">
              {t('markets.stocks.destok.done')}
            </Notice>
          )}
        </div>
      </div>
    </Card>
  );
}
