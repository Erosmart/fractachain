import { useCallback, useEffect, useMemo, useRef, useState, type SubmitEvent } from 'react';
import type { OrderSide } from '@fractachain/shared';
import { ArrowUpRight, CheckCircle2, MousePointerClick, ShieldCheck, Zap } from 'lucide-react';
import RequireOnboarding from '@/components/guards/RequireOnboarding';
import { withIsland } from '@/components/island/withIsland';
import type { Market } from '@/core/api/types';
import { container } from '@/core/container';
import { errorMessage } from '@/core/errors';
import { isVisibleListing } from '@/core/market/listings';
import { useAuth } from '@/hooks/useAuth';
import { useI18n } from '@/hooks/useI18n';
import { useVisibleInterval } from '@/hooks/useVisibleInterval';
import { fmtQty, fromSandbox, fromSdex, type Book, type Level, type TakenLevel } from '../model';
import PriceCandles from './PriceCandles';

const { api, wallet, navigator } = container;

/** Secondary market: Stellar DEX book when the listing trades there, sandbox matcher otherwise. */
function Orderbook() {
  const { t } = useI18n();
  const { user, refreshUser, approveToken } = useAuth();
  const [markets, setMarkets] = useState<Market[]>([]);
  const [listingId, setListingId] = useState(() => navigator.searchParam('listing') || '');
  const [book, setBook] = useState<Book | null>(null);
  const [side, setSide] = useState<OrderSide>('BUY');
  // Inputs keep the raw string so the field can be emptied while typing;
  // price/amount are the parsed numbers the rest of the form uses.
  const [priceStr, setPriceStr] = useState('10');
  const [amountStr, setAmountStr] = useState('1');
  const price = Number(priceStr) || 0;
  const amount = Number(amountStr) || 0;
  const setPrice = (v: number) => setPriceStr(String(v));
  const setAmount = (v: number) => setAmountStr(String(v));
  const [taken, setTaken] = useState<TakenLevel | null>(null);
  const [notice, setNotice] = useState('');
  const amountInput = useRef<HTMLInputElement>(null);

  const holding = user?.holdings?.find((h) => h.listingId === listingId);
  const onSdex = book?.venue === 'sdex';
  const selfCustody = user?.custodyMode === 'SELF';

  // On SDEX the ledger is the authority, not our database: the trustline's
  // authorized flag is literally what decides whether Stellar accepts the
  // order, so reading anything else would let the UI promise a trade the
  // network will reject.
  const approved = onSdex ? Boolean(book?.authorized) : user?.kycStatus === 'APPROVED';
  const needsTrustline = onSdex
    ? Boolean(book?.needsTrustline)
    : side === 'BUY' && approved && !user?.trustlines?.includes(listingId);

  /**
   * Prefers the real Stellar order book and falls back to the local matcher.
   * SDEX only answers for listings that already have an issuing account on
   * the network, so a demo without testnet keys still gets a working book.
   */
  const loadBook = useCallback(async (id: string) => {
    if (!id) return;
    try {
      setBook(fromSdex(await api.market.sdexBook(id)));
      return;
    } catch {
      // not on SDEX (or Horizon down): use the sandbox book
    }
    try {
      setBook(fromSandbox(await api.market.sandboxBook(id)));
    } catch {
      // keep the last book on screen until the next poll
    }
  }, []);

  useEffect(() => {
    api.market
      .markets()
      .then((rows) => setMarkets(rows.filter((m) => isVisibleListing(m.listingId))))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!listingId && markets[0]) setListingId(markets[0].listingId);
  }, [markets, listingId]);

  useVisibleInterval(() => loadBook(listingId), 4000, Boolean(listingId), `${listingId}:${user?.id ?? ''}`);

  useEffect(() => {
    if (book?.lastPrice) setPrice(book.lastPrice);
    setTaken(null);
    // Only when the market changes: polling must not overwrite what the user typed.
  }, [book?.listingId]);

  const openOrders = useMemo(
    () => (book?.myOrders || []).filter((o) => o.status === 'OPEN' || o.status === 'PARTIAL'),
    [book?.myOrders],
  );

  // The backend reserves cash against resting buys in *every* market, so take its
  // numbers rather than deriving them from myOrders, which only covers this listing.
  const reservedCash = book?.reservedCash ?? 0;
  const reservedTokens = book?.reservedTokens ?? 0;

  // On SDEX the spendable balance lives on-chain: the backend already nets out
  // what resting offers have locked (liabilities). Sandbox books use the
  // platform ledger minus reserved cash.
  const freeCash = onSdex
    ? Number(book?.usdcBalance || 0)
    : Math.max(0, Number(user?.cashUsdc || 0) - reservedCash);
  const freeTokens = onSdex
    ? Number(book?.tokenBalance || 0)
    : Math.max(0, Number(holding?.tokens || 0) - reservedTokens);

  const maxQty = useMemo(() => {
    if (side === 'SELL') return freeTokens;
    return price > 0 ? freeCash / price : 0;
  }, [side, freeTokens, freeCash, price]);

  /** Click on a resting level: take its price, let the user pick the size. */
  const takeLevel = (from: 'ask' | 'bid', level: Level) => {
    setSide(from === 'ask' ? 'BUY' : 'SELL');
    setPrice(level.price);
    setTaken({ from, price: level.price, available: level.amount });
    setNotice('');
    requestAnimationFrame(() => {
      amountInput.current?.focus();
      amountInput.current?.select();
    });
  };

  const applyQty = (qty: number) => {
    setAmount(Math.max(0, Math.round(qty * 1e4) / 1e4));
    amountInput.current?.focus();
  };

  /** Relays a transaction the investor already signed (self-custody paths). */
  const submitSigned = (xdr: string) => api.market.submitSdex(xdr);

  const submit = async (e: SubmitEvent) => {
    e.preventDefault();
    setNotice('');
    const order = { side, price, amount };
    try {
      if (onSdex && selfCustody) {
        // The order leaves from the investor's wallet: Freighter signs it and
        // the backend only relays it.
        setNotice(t('ob.signInFreighter'));
        const prepared = await api.market.prepareSdexOrder(listingId, order);
        const relayed = await submitSigned(await wallet.signer.signTransaction(prepared.xdr));
        setTaken(null);
        await refreshUser();
        await loadBook(listingId);
        setNotice(t('ob.sentSdex', { hash: String(relayed?.hash || '').slice(0, 12) }));
        return;
      }
      if (onSdex) {
        const data = await api.market.placeSdexOrder(listingId, order);
        setTaken(null);
        await refreshUser();
        setBook(fromSdex(data.book));
        setNotice(t('ob.sentSdex', { hash: String(data.hash).slice(0, 12) }));
        return;
      }
      const data = await api.market.placeSandboxOrder(listingId, order);
      setTaken(null);
      await refreshUser();
      setBook(fromSandbox(data.book));
      setNotice(data.order.status === 'FILLED' ? t('ob.filled') : t('ob.resting'));
    } catch (err) {
      setNotice(errorMessage(err, t('ob.orderFail')));
    }
  };

  const cancel = async (id: string) => {
    try {
      if (book?.venue === 'sdex') {
        // On SDEX a cancel is an offer for zero, so it needs the original side
        // and price to identify and zero out the resting offer.
        const mine = book.myOrders.find((o) => o.id === id);
        if (!mine) return;
        const data = await api.market.cancelSdexOrder(listingId, {
          side: mine.side,
          offerId: id,
          price: mine.price,
          legacy: mine.legacy,
        });
        // Custodial: already submitted by the backend. Self-custody: sign and relay.
        if (data?.xdr) await submitSigned(await wallet.signer.signTransaction(data.xdr));
        await loadBook(listingId);
        void refreshUser();
        return;
      }
      const data = await api.market.cancelSandboxOrder(id);
      setBook(fromSandbox(data.book));
      void refreshUser();
    } catch (err) {
      setNotice(errorMessage(err, t('ob.cancelFail')));
    }
  };

  const total = useMemo(() => price * amount, [price, amount]);

  // Asks arrive ascending; render them descending so the best ask sits against the spread row.
  const asksDisplay = useMemo(() => (book ? [...book.asks].reverse() : []), [book]);

  return (
    <div className="space-y-6 py-4">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <p className="font-lcd text-[11px] uppercase tracking-[0.2em] text-neutral-500">{t('ob.kicker')}</p>
          <h1 className="text-2xl sm:text-3xl font-extrabold font-display">
            {onSdex ? t('ob.titleSdex') : t('ob.titleLocal')}
          </h1>
          <p className="text-neutral-600 mt-1 max-w-xl">
            {onSdex ? t('ob.descSdex') : book ? t('ob.descLocal') : t('ob.descNone')}
          </p>
        </div>
        <div className="flex items-center gap-2 px-3 py-2 rounded-2xl crystal-card text-sm">
          <ShieldCheck className="w-4 h-4" />
          {onSdex ? t('ob.badgeSdex') : t('ob.badgeLocal')}
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label={t('ob.kicker')}>
        {markets.length === 0 && (
          <p className="text-sm text-neutral-500">
            {t('ob.noMarkets')}{' '}
            <a href="/market" className="underline font-bold">
              {t('ob.openOffering')}
            </a>
            .
          </p>
        )}
        {markets.map((m) => (
          <button
            key={m.listingId}
            type="button"
            role="tab"
            aria-selected={listingId === m.listingId}
            onClick={() => setListingId(m.listingId)}
            className={`px-4 py-2 rounded-xl text-xs font-display font-bold whitespace-nowrap border ${
              listingId === m.listingId ? 'bg-black text-white border-black' : 'bg-white border-black/10'
            }`}
          >
            {m.tokenTicker} / USDC
          </button>
        ))}
      </div>

      {book && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 p-6 rounded-3xl crystal-card space-y-4">
            <div className="flex flex-col gap-1 sm:flex-row sm:justify-between sm:items-center text-sm">
              <span className="font-display font-extrabold break-words">
                {book.tokenTicker} · {book.legalName}
              </span>
              <span className="font-mono text-xs text-neutral-500 shrink-0">
                {t('ob.last')} ${book.lastPrice.toFixed(2)}
                {book.spread != null ? ` · spread $${book.spread.toFixed(2)}` : ''}
              </span>
            </div>

            <PriceCandles trades={book.trades} refPrice={book.refPrice} />

            <p className="text-[11px] text-neutral-500 inline-flex items-center gap-1.5">
              <MousePointerClick className="w-3.5 h-3.5 shrink-0" />
              {t('ob.hint')}
            </p>

            <div className="py-2.5 px-4 rounded-xl bg-black/[0.04] flex flex-col gap-1 sm:flex-row sm:justify-between sm:items-center font-mono">
              <span className="text-base font-bold">${book.lastPrice.toFixed(2)}</span>
              <span className="text-[11px] text-neutral-500 inline-flex items-center gap-1">
                <ArrowUpRight className="w-3.5 h-3.5" /> {t('ob.refIpo')} ${book.refPrice.toFixed(2)}
              </span>
            </div>

            {/* Compradores a la izquierda, vendedores a la derecha. */}
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wide text-[#2f6f28] mb-1">
                  {t('ob.buys')}
                </p>
                <div className="grid grid-cols-3 text-[11px] font-mono text-neutral-500 uppercase">
                  <span>{t('ob.price')}</span>
                  <span className="text-right">{t('ob.qty')}</span>
                  <span className="text-right">{t('ob.total')}</span>
                </div>
                <div className="space-y-1 font-mono text-xs mt-1">
                  {book.bids.length === 0 && <p className="text-neutral-400">{t('ob.noBids')}</p>}
                  {book.bids.map((bid) => (
                    <button
                      key={`b-${bid.price}-${bid.legacy ? 'l' : 'c'}`}
                      type="button"
                      onClick={() => takeLevel('bid', bid)}
                      title={t('ob.takeBid', { p: bid.price.toFixed(2), n: fmtQty(bid.amount) })}
                      className={`w-full grid grid-cols-3 p-1.5 rounded relative overflow-hidden text-[#2f6f28] text-left cursor-pointer transition hover:bg-emerald-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                        taken?.from === 'bid' && taken.price === bid.price
                          ? 'ring-2 ring-emerald-600 bg-emerald-50'
                          : ''
                      }`}
                    >
                      <div
                        className="absolute right-0 top-0 bottom-0 bg-emerald-100 pointer-events-none"
                        style={{ width: `${bid.depthPercent}%` }}
                      />
                      <span className="font-bold relative z-10">
                        ${bid.price.toFixed(2)}
                        {bid.legacy && (
                          <span className="ml-1 text-[8px] text-amber-600 font-bold uppercase">
                            {t('ob.legacy')}
                          </span>
                        )}
                      </span>
                      <span className="text-right relative z-10">{fmtQty(bid.amount)}</span>
                      <span className="text-right relative z-10 text-neutral-500">
                        ${bid.total.toLocaleString()}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-[11px] font-bold uppercase tracking-wide text-red-700 mb-1">
                  {t('ob.sells')}
                </p>
                <div className="grid grid-cols-3 text-[11px] font-mono text-neutral-500 uppercase">
                  <span>{t('ob.price')}</span>
                  <span className="text-right">{t('ob.qty')}</span>
                  <span className="text-right">{t('ob.total')}</span>
                </div>
                <div className="space-y-1 font-mono text-xs mt-1">
                  {asksDisplay.length === 0 && <p className="text-neutral-400">{t('ob.noAsks')}</p>}
                  {asksDisplay.map((ask) => (
                    <button
                      key={`a-${ask.price}-${ask.legacy ? 'l' : 'c'}`}
                      type="button"
                      onClick={() => takeLevel('ask', ask)}
                      title={t('ob.takeAsk', { p: ask.price.toFixed(2), n: fmtQty(ask.amount) })}
                      className={`w-full grid grid-cols-3 p-1.5 rounded relative overflow-hidden text-red-700 text-left cursor-pointer transition hover:bg-red-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 ${
                        taken?.from === 'ask' && taken.price === ask.price
                          ? 'ring-2 ring-red-500 bg-red-50'
                          : ''
                      }`}
                    >
                      <div
                        className="absolute right-0 top-0 bottom-0 bg-red-100 pointer-events-none"
                        style={{ width: `${ask.depthPercent}%` }}
                      />
                      <span className="font-bold relative z-10">
                        ${ask.price.toFixed(2)}
                        {ask.legacy && (
                          <span className="ml-1 text-[8px] text-amber-600 font-bold uppercase">
                            {t('ob.legacy')}
                          </span>
                        )}
                      </span>
                      <span className="text-right relative z-10">{fmtQty(ask.amount)}</span>
                      <span className="text-right relative z-10 text-neutral-500">
                        ${ask.total.toLocaleString()}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {book.trades.length > 0 && (
              <div className="pt-2 border-t border-black/10 space-y-1">
                <p className="text-xs font-bold">{t('ob.trades')}</p>
                <div className="grid grid-cols-4 text-[10px] font-mono text-neutral-500 uppercase">
                  <span>{t('ob.price')}</span>
                  <span className="text-right">{t('ob.qty')}</span>
                  <span className="text-right">{t('ob.buyer')}</span>
                  <span className="text-right">{t('ob.seller')}</span>
                </div>
                {book.trades.slice(0, 20).map((tr) => (
                  <div
                    key={tr.id}
                    className="grid grid-cols-4 text-[11px] font-mono text-neutral-700 py-0.5 border-b border-black/5 last:border-0"
                  >
                    <span className="font-bold">
                      ${tr.price.toFixed(2)}
                      {tr.legacy && (
                        <span className="ml-1 text-[8px] text-amber-600 font-bold uppercase">
                          {t('ob.legacy')}
                        </span>
                      )}
                    </span>
                    <span className="text-right">{fmtQty(tr.amount)}</span>
                    <span className="text-right text-[#2f6f28]" title={tr.buyer}>
                      {tr.buyer ? `${tr.buyer.slice(0, 4)}…${tr.buyer.slice(-4)}` : '—'}
                    </span>
                    <span className="text-right text-red-700" title={tr.seller}>
                      {tr.seller ? `${tr.seller.slice(0, 4)}…${tr.seller.slice(-4)}` : '—'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="lg:col-span-4 p-6 rounded-3xl crystal-card space-y-5">
            <h3 className="font-display font-extrabold">{t('ob.limitOrder')}</h3>
            <p className="text-xs text-neutral-500">
              {t('ob.balance')} $
              {(onSdex ? Number(book?.usdcTotal ?? 0) : freeCash).toLocaleString('es-AR', {
                maximumFractionDigits: 2,
              })}{' '}
              USDC
              {(onSdex ? (book?.tokenTotal ?? 0) > 0 : !!holding)
                ? ` · ${fmtQty(onSdex ? Number(book?.tokenTotal || 0) : Number(holding?.tokens || 0))} ${book.tokenTicker}`
                : ''}
              {onSdex
                ? (Number(book?.usdcTotal || 0) - freeCash > 0.005 ||
                    Number(book?.tokenTotal || 0) - freeTokens > 0.005) &&
                  ` · ${t('ob.lockedOrders', {
                    u: (Number(book?.usdcTotal || 0) - freeCash).toLocaleString('es-AR', {
                      maximumFractionDigits: 2,
                    }),
                    tk: fmtQty(Math.max(0, Number(book?.tokenTotal || 0) - freeTokens)),
                  })}`
                : reservedCash + reservedTokens > 0
                  ? ` ${t('ob.freeNote')}`
                  : ''}
            </p>
            <div className="p-1 rounded-xl bg-black/[0.04] flex gap-1">
              <button
                type="button"
                aria-pressed={side === 'BUY'}
                onClick={() => {
                  setSide('BUY');
                  setTaken(null);
                }}
                className={`flex-1 py-2 rounded-lg text-xs font-bold ${side === 'BUY' ? 'bg-[#4ea743] text-black' : 'text-neutral-500'}`}
              >
                {t('ob.buy')}
              </button>
              <button
                type="button"
                aria-pressed={side === 'SELL'}
                onClick={() => {
                  setSide('SELL');
                  setTaken(null);
                }}
                className={`flex-1 py-2 rounded-lg text-xs font-bold ${side === 'SELL' ? 'bg-red-500 text-white' : 'text-neutral-500'}`}
              >
                {t('ob.sell')}
              </button>
            </div>
            <form onSubmit={submit} className="space-y-4">
              <label className="block text-xs space-y-1">
                {t('ob.priceUsdc')}
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min={0.01}
                  value={priceStr}
                  onChange={(e) => {
                    setPriceStr(e.target.value);
                    setTaken(null);
                  }}
                  onFocus={(e) => e.target.select()}
                  className="w-full px-3 py-2.5 rounded-xl border border-black/10 font-mono"
                />
              </label>

              {taken && (
                <div className="px-3 py-2 rounded-xl bg-black/[0.04] text-[11px] space-y-1.5">
                  <p>
                    {t(taken.from === 'ask' ? 'ob.takingAsk' : 'ob.takingBid')}{' '}
                    <span className="font-mono font-bold">${taken.price.toFixed(2)}</span> ·{' '}
                    <span className="font-mono">{fmtQty(taken.available)}</span>{' '}
                    {t(taken.from === 'ask' ? 'ob.available' : 'ob.demanded')}
                  </p>
                  <button
                    type="button"
                    onClick={() => applyQty(Math.min(taken.available, maxQty))}
                    className="underline font-bold"
                  >
                    {t('ob.takeAll')}
                  </button>
                </div>
              )}

              <label className="block text-xs space-y-1">
                {t('ob.amount')}
                <input
                  ref={amountInput}
                  type="number"
                  inputMode="decimal"
                  step="0.0001"
                  min={0.0001}
                  value={amountStr}
                  onChange={(e) => setAmountStr(e.target.value)}
                  onFocus={(e) => e.target.select()}
                  className="w-full px-3 py-2.5 rounded-xl border border-black/10 font-mono"
                />
              </label>

              <div className="flex gap-1.5">
                {[0.25, 0.5, 0.75, 1].map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => applyQty(maxQty * f)}
                    disabled={maxQty <= 0}
                    className="flex-1 py-1.5 rounded-lg bg-black/[0.04] text-[11px] font-bold disabled:opacity-40 hover:bg-black/[0.08]"
                  >
                    {f === 1 ? t('ob.max') : `${f * 100}%`}
                  </button>
                ))}
              </div>

              <p className="text-sm font-mono">
                {t('ob.total')} ${total.toFixed(2)} USDC
              </p>
              {amount > maxQty + 1e-9 && (
                <p className="text-xs text-red-600">
                  {t('ob.exceeds', {
                    n: fmtQty(maxQty),
                    unit: side === 'BUY' ? t('ob.atPrice', { p: price.toFixed(2) }) : book.tokenTicker,
                  })}
                </p>
              )}
              {!approved && (
                <p className="text-sm text-neutral-600">
                  {t('ob.kycOnly')}{' '}
                  <a href="/login" className="underline font-bold">
                    {t('nav.login')}
                  </a>
                </p>
              )}
              {needsTrustline && (
                <div className="px-3 py-2.5 rounded-xl bg-amber-50 border border-amber-200 text-xs space-y-2">
                  <p>{t('ob.needTrustline', { code: book.tokenTicker })}</p>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await approveToken(listingId);
                        setNotice(t('ob.approvedNotice', { code: book.tokenTicker }));
                      } catch (err) {
                        setNotice(errorMessage(err));
                      }
                    }}
                    className="px-3 py-1.5 rounded-lg bg-black text-white font-bold"
                  >
                    {t('ob.approve', { code: book.tokenTicker })}
                  </button>
                </div>
              )}
              {notice && (
                <p className="text-sm flex items-start gap-2" role="status">
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" /> {notice}
                </p>
              )}
              <button
                type="submit"
                disabled={!approved || needsTrustline || price <= 0 || amount <= 0}
                className={`w-full py-3 rounded-2xl font-display font-bold text-sm inline-flex items-center justify-center gap-2 disabled:opacity-40 ${
                  side === 'BUY' ? 'bg-black text-white' : 'bg-red-600 text-white'
                }`}
              >
                <Zap className="w-4 h-4" />
                {side === 'BUY' ? t('ob.postBuy') : t('ob.postSell')}
              </button>
            </form>
            {openOrders.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-black/10">
                <p className="text-xs font-bold">{t('ob.myOrders')}</p>
                {openOrders.map((o) => (
                  <div key={o.id} className="flex justify-between items-center text-xs gap-2">
                    <span className="flex items-center gap-1.5">
                      {o.side} {fmtQty(o.remaining)} @ ${o.price}
                      {o.legacy && (
                        <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 text-[9px] font-bold uppercase">
                          {t('ob.legacy')}
                        </span>
                      )}
                    </span>
                    <button type="button" onClick={() => cancel(o.id)} className="underline">
                      {t('ob.cancel')}
                    </button>
                  </div>
                ))}
              </div>
            )}
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
