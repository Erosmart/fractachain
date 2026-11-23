import { forwardRef, useId, useImperativeHandle, useMemo, useRef, useState, type SubmitEvent } from 'react';
import type { OrderSide } from '@fractachain/shared';
import { IdCard, LogIn, Stamp } from 'lucide-react';
import { investorReadyPath } from '@/core/auth/onboardingPath';
import { Card, ChecklistItem, PillTabs } from '@/components/ui/kit';
import { money, qty } from '@/core/market/money';
import { useI18n } from '@/hooks/useI18n';
import OpStatus from '@/features/market/components/OpStatus';
import type { OrderBookState } from '../hooks/useOrderBook';
import type { Level, TakenLevel } from '../model';

export interface OrderFormHandle {
  /** Loads a resting level into the form (price + side) and focuses the size. */
  take: (from: 'bid' | 'ask', level: Level) => void;
}

const parse = (s: string) => Number(s.replace(',', '.')) || 0;

/** Limit order ticket: side, price, size (with quick sizes), balances, requirements and status. */
const OrderForm = forwardRef<
  OrderFormHandle,
  { state: OrderBookState; onTaken: (level: TakenLevel | null) => void }
>(function OrderForm({ state, onTaken }, ref) {
  const { t } = useI18n();
  const { book, approved, freeCash, freeTokens, lockedCash, lockedTokens, tx, busy, actions } = state;
  const ids = { price: useId(), amount: useId(), error: useId() };
  const [side, setSide] = useState<OrderSide>('BUY');
  const [priceStr, setPriceStr] = useState(() => (book?.lastPrice ? book.lastPrice.toFixed(2) : ''));
  const [amountStr, setAmountStr] = useState('1');
  const [taken, setTaken] = useState<TakenLevel | null>(null);
  const amountInput = useRef<HTMLInputElement>(null);
  const price = parse(priceStr);
  const amount = parse(amountStr);
  const code = book?.tokenTicker ?? '';

  const updateTaken = (next: TakenLevel | null) => {
    setTaken(next);
    onTaken(next);
  };

  useImperativeHandle(ref, () => ({
    take(from, level) {
      setSide(from === 'ask' ? 'BUY' : 'SELL');
      setPriceStr(String(level.price));
      updateTaken({ from, price: level.price, available: level.amount });
      requestAnimationFrame(() => {
        amountInput.current?.focus();
        amountInput.current?.select();
      });
    },
  }));

  const maxQty = useMemo(
    () => (side === 'SELL' ? freeTokens : price > 0 ? freeCash / price : 0),
    [side, freeTokens, freeCash, price],
  );
  const applyQty = (n: number) => {
    setAmountStr(String(Math.max(0, Math.floor(n * 1e4) / 1e4)));
    amountInput.current?.focus();
  };
  const exceeds = amount > maxQty + 1e-9;
  const needsTrustline = state.needsTrustline(side);
  const canSubmit =
    state.signedIn && approved && !needsTrustline && price > 0 && amount > 0 && !exceeds && !busy;

  const submit = async (e: SubmitEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    if (await actions.place({ side, price, amount })) updateTaken(null);
  };

  return (
    <Card title={t('markets.form.title')} bodyClassName="space-y-4">
      <PillTabs
        label={t('markets.form.side')}
        active={side}
        onChange={(k) => {
          setSide(k as OrderSide);
          updateTaken(null);
        }}
        className="w-full [&>button]:flex-1 [&>button]:justify-center"
        items={[
          { key: 'BUY', label: t('markets.form.buy') },
          { key: 'SELL', label: t('markets.form.sell') },
        ]}
      />

      <dl className="grid grid-cols-2 gap-3 rounded-xl bg-surface-2 px-3.5 py-3 text-xs">
        <div>
          <dt className="text-muted">{t('markets.form.available')}</dt>
          <dd className="mt-0.5 font-medium text-ink tnum">{money(freeCash, 'USDC', 2)}</dd>
          <dd className="text-ink-2 tnum">
            {qty(freeTokens)} {code}
          </dd>
        </div>
        {(lockedCash > 0.005 || lockedTokens > 0.00005) && (
          <div>
            <dt className="text-muted">{t('markets.form.locked')}</dt>
            <dd className="mt-0.5 font-medium text-ink tnum">{money(lockedCash, 'USDC', 2)}</dd>
            <dd className="text-ink-2 tnum">
              {qty(lockedTokens)} {code}
            </dd>
          </div>
        )}
      </dl>

      <form onSubmit={submit} className="space-y-4" noValidate>
        <div>
          <label htmlFor={ids.price} className="label">
            {t('markets.form.price')}
          </label>
          <input
            id={ids.price}
            className="input tnum"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={priceStr}
            onChange={(e) => {
              setPriceStr(e.target.value.replace(/[^\d.,]/g, ''));
              updateTaken(null);
            }}
            onFocus={(e) => e.target.select()}
          />
        </div>

        {taken && (
          <div className="rounded-xl bg-sky-soft px-3.5 py-2.5 text-xs text-ink">
            <p>
              {t('markets.form.taking', {
                side: t(taken.from === 'ask' ? 'markets.form.sideAsk' : 'markets.form.sideBid'),
                p: money(taken.price, 'USDC', 2),
                n: qty(taken.available),
              })}
            </p>
            <button
              type="button"
              className="mt-1 font-medium underline underline-offset-2"
              onClick={() => applyQty(Math.min(taken.available, maxQty))}
            >
              {t('markets.form.takeAll')}
            </button>
          </div>
        )}

        <div>
          <label htmlFor={ids.amount} className="label">
            {t('markets.form.amount', { code })}
          </label>
          <input
            id={ids.amount}
            ref={amountInput}
            className="input tnum"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={amountStr}
            aria-invalid={exceeds}
            aria-describedby={exceeds ? ids.error : undefined}
            onChange={(e) => setAmountStr(e.target.value.replace(/[^\d.,]/g, ''))}
            onFocus={(e) => e.target.select()}
          />
          <div className="mt-2 grid grid-cols-4 gap-1.5" role="group" aria-label={t('markets.form.quick')}>
            {[0.25, 0.5, 0.75, 1].map((f) => (
              <button
                key={f}
                type="button"
                className="btn btn-secondary btn-sm px-0"
                disabled={maxQty <= 0}
                onClick={() => applyQty(maxQty * f)}
              >
                {f === 1 ? t('markets.form.max') : `${f * 100} %`}
              </button>
            ))}
          </div>
          {exceeds && (
            <p id={ids.error} className="mt-1.5 text-xs font-medium text-bad">
              {t('markets.form.exceeds', { n: `${qty(maxQty)} ${code}` })}
            </p>
          )}
        </div>

        <div className="flex items-baseline justify-between border-t border-line pt-3">
          <span className="text-sm text-ink-2">{t('markets.form.total')}</span>
          <span className="text-lg font-medium text-ink tnum">{money(price * amount, 'USDC', 2)}</span>
        </div>

        {!state.signedIn ? (
          <ChecklistItem
            icon={<LogIn className="h-4 w-4" />}
            title={t('markets.form.signIn')}
            subtitle={t('markets.form.signInSub')}
            href={`/login?next=${encodeURIComponent('/orderbook')}`}
          />
        ) : (
          !approved && (
            <ChecklistItem
              icon={<IdCard className="h-4 w-4" />}
              title={t('markets.form.kyc')}
              subtitle={t('markets.form.kycCta')}
              href={investorReadyPath(state.user) ?? '/onboarding/kyc'}
            />
          )
        )}
        {approved && needsTrustline && (
          <ChecklistItem
            icon={<Stamp className="h-4 w-4" />}
            title={t('markets.form.trustline', { code })}
            trailing={
              <button
                type="button"
                className="btn btn-soft btn-sm"
                disabled={busy}
                onClick={() => void actions.approve()}
              >
                {t('markets.form.approve', { code })}
              </button>
            }
          />
        )}

        <button type="submit" className="btn btn-primary btn-lg w-full" disabled={!canSubmit}>
          {side === 'BUY' ? t('markets.form.submitBuy') : t('markets.form.submitSell')}
        </button>
      </form>

      <OpStatus
        tx={tx ? { ...tx, explorer: tx.hash ? state.explorer(tx.hash) : null } : null}
        stateLabel={(s) => t(`markets.tx.${s}`)}
        regionLabel={t('markets.tx.region')}
        viewLabel={t('markets.tx.view')}
        detailLabel={t('markets.tx.detail')}
      />
    </Card>
  );
});

export default OrderForm;
