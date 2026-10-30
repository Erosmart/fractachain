import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { StatusChip } from '@/components/ui/kit';
import type { NewStockInput } from '@/core/api/types';
import { formatAmount, formatInt } from '@/core/format/number';
import { useI18n } from '@/hooks/useI18n';
import { EMPTY_STOCK, STOCK_TEXT_FIELDS, randomDemoStock } from '../model';
import type { IssuanceAdmin } from '../hooks/useIssuanceAdmin';

/** Merval catalog: emit a tokenized stock and toggle what the public market lists. */
export default function StockCatalogSection({ admin }: { admin: IssuanceAdmin }) {
  const { t } = useI18n();
  const [stockForm, setStockForm] = useState<NewStockInput>(EMPTY_STOCK);

  const emit = async () => {
    if (await admin.emitStock(stockForm)) setStockForm(EMPTY_STOCK);
  };

  return (
    <section className="card card-pad space-y-5" aria-labelledby="stocks-title">
      <header>
        <h2 id="stocks-title" className="title">
          {t('admin.issuance.stocks')}
        </h2>
        <p className="subtitle mt-0.5 max-w-2xl">{t('admin.issuance.stocksSub')}</p>
      </header>

      <form
        className="space-y-4 rounded-2xl bg-surface-2 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          void emit();
        }}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-medium text-ink">{t('admIss.newStock')}</h3>
          <button
            type="button"
            onClick={() => setStockForm(randomDemoStock())}
            className="btn btn-soft btn-sm"
          >
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            {t('admIss.autofill')}
          </button>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STOCK_TEXT_FIELDS.map((key) => (
            <div key={key}>
              <label htmlFor={`stock-${key}`} className="label">
                {t(`admIss.sf.${key}`)}
              </label>
              <input
                id={`stock-${key}`}
                className="input"
                value={stockForm[key]}
                onChange={(e) => setStockForm((f) => ({ ...f, [key]: e.target.value }))}
              />
            </div>
          ))}
          <div>
            <label htmlFor="stock-price" className="label">
              {t('admIss.sf.priceUsdc')}
            </label>
            <input
              id="stock-price"
              type="number"
              inputMode="decimal"
              className="input"
              value={stockForm.priceUsdc}
              onChange={(e) => setStockForm((f) => ({ ...f, priceUsdc: Number(e.target.value) }))}
              onFocus={(e) => e.target.select()}
            />
          </div>
          <div>
            <label htmlFor="stock-custody" className="label">
              {t('admIss.sf.custodiedShares')}
            </label>
            <input
              id="stock-custody"
              type="number"
              inputMode="numeric"
              className="input"
              value={stockForm.custodiedShares}
              onChange={(e) => setStockForm((f) => ({ ...f, custodiedShares: Number(e.target.value) }))}
              onFocus={(e) => e.target.select()}
            />
          </div>
        </div>
        <button type="submit" className="btn btn-primary">
          {t('admIss.emit')}
        </button>
      </form>

      {admin.stocks.length === 0 ? (
        <p className="text-sm text-muted">{t('admIss.noStocks')}</p>
      ) : (
        <ul className="divide-y divide-line">
          {admin.stocks.map((s) => (
            <li key={s.ticker} className="flex flex-wrap items-center justify-between gap-3 py-3.5">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-ink">{s.tokenTicker}</span>
                  <span className="font-mono text-xs text-muted">{s.ticker}</span>
                  <StatusChip tone={s.active ? 'good' : 'neutral'}>
                    {s.active ? t('admin.issuance.inMarket') : t('admin.issuance.hidden')}
                  </StatusChip>
                </div>
                <p className="mt-0.5 truncate text-xs text-ink-2">
                  {s.companyName} · ISIN <span className="font-mono">{s.isin}</span>
                </p>
                <p className="mt-0.5 text-xs text-muted tnum">
                  {formatAmount(Number(s.priceUsdc) || 0, 2)} USDC ·{' '}
                  {formatInt(Number(s.custodiedSharesInCajaDeValores || 0))} {t('admIss.inCustody')}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <a href="/stocks" className="btn btn-ghost btn-sm">
                  {t('admIss.viewMarket')}
                </a>
                <button
                  type="button"
                  onClick={() => admin.toggleStock(s.ticker, !s.active)}
                  className={`btn btn-sm ${s.active ? 'btn-danger' : 'btn-primary'}`}
                >
                  {s.active ? t('admIss.deactivate') : t('admIss.activate')}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
