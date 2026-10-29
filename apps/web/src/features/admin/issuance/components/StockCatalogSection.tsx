import { useState } from 'react';
import type { NewStockInput } from '@/core/api/types';
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
    <section className="space-y-4">
      <h2 className="font-section text-xl font-extrabold">{t('admIss.secStocks')}</h2>
      <p className="text-sm text-neutral-600 max-w-2xl">
        {t('admIss.secStocksBodyPre')} <span className="font-mono">/stocks</span> {t('admIss.secStocksBodyPost')}
      </p>

      <div className="p-5 rounded-3xl crystal-card space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold">{t('admIss.newStock')}</h3>
          <button type="button" onClick={() => setStockForm(randomDemoStock())} className="px-3 py-1.5 rounded-xl border border-black/20 text-xs font-bold">
            {t('admIss.autofill')}
          </button>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {STOCK_TEXT_FIELDS.map((key) => (
            <label key={key} className="text-xs space-y-1">
              <span className="font-bold">{t(`admIss.sf.${key}`)}</span>
              <input
                className="w-full px-3 py-2 rounded-xl border border-black/10"
                value={stockForm[key]}
                onChange={(e) => setStockForm((f) => ({ ...f, [key]: e.target.value }))}
              />
            </label>
          ))}
          <label className="text-xs space-y-1">
            <span className="font-bold">{t('admIss.sf.priceUsdc')}</span>
            <input
              type="number"
              className="w-full px-3 py-2 rounded-xl border border-black/10"
              value={stockForm.priceUsdc}
              onChange={(e) => setStockForm((f) => ({ ...f, priceUsdc: Number(e.target.value) }))}
              onFocus={(e) => e.target.select()}
            />
          </label>
          <label className="text-xs space-y-1">
            <span className="font-bold">{t('admIss.sf.custodiedShares')}</span>
            <input
              type="number"
              className="w-full px-3 py-2 rounded-xl border border-black/10"
              value={stockForm.custodiedShares}
              onChange={(e) => setStockForm((f) => ({ ...f, custodiedShares: Number(e.target.value) }))}
              onFocus={(e) => e.target.select()}
            />
          </label>
        </div>
        <button type="button" onClick={emit} className="px-5 py-3 rounded-2xl bg-black text-white font-display font-bold text-sm">
          {t('admIss.emit')}
        </button>
      </div>

      <div className="space-y-2">
        {admin.stocks.length === 0 && <p className="text-neutral-500 text-sm">{t('admIss.noStocks')}</p>}
        {admin.stocks.map((s) => (
          <div key={s.ticker} className="p-4 rounded-3xl crystal-card flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-display font-extrabold">{s.tokenTicker}</span>
                <span className="text-xs text-neutral-500 font-mono">({s.ticker})</span>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    s.active ? 'bg-leaf-100 text-[#2f6f28] border border-[#8fcb7a]/50' : 'bg-neutral-200 text-neutral-500'
                  }`}
                >
                  {s.active ? t('admIss.inMarket') : t('admIss.hidden')}
                </span>
              </div>
              <div className="text-xs text-neutral-600 truncate">
                {s.companyName} · ISIN {s.isin}
              </div>
              <div className="text-[11px] text-neutral-500 font-mono">
                ${s.priceUsdc} USDC · {Number(s.custodiedSharesInCajaDeValores || 0).toLocaleString()} {t('admIss.inCustody')}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <a href="/stocks" className="px-3 py-2 text-xs font-bold underline">
                {t('admIss.viewMarket')}
              </a>
              <button
                type="button"
                onClick={() => admin.toggleStock(s.ticker, !s.active)}
                className={`px-3 py-2 rounded-xl text-xs font-bold ${s.active ? 'border border-red-300 text-red-700' : 'bg-black text-white'}`}
              >
                {s.active ? t('admIss.deactivate') : t('admIss.activate')}
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
