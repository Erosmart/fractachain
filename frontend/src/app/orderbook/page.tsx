'use client';

import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowUpRight, CheckCircle2, MousePointerClick, ShieldCheck, Zap } from 'lucide-react';
import { API_BASE_URL, bearerHeaders } from '../../lib/api';
import { isVisibleListing } from '../../lib/listings';
import { useAuth } from '../../context/AuthContext';
import { useVisibleInterval } from '../../lib/useVisibleInterval';

type Market = {
  listingId: string;
  tokenTicker: string;
  ticker: string;
  legalName: string;
  pricePerShareUsdc: number;
  status: string;
};

type Level = { price: number; amount: number; total: number; depthPercent: number };
type MyOrder = {
  id: string;
  side: 'BUY' | 'SELL';
  price: number;
  amount: number;
  remaining: number;
  status: string;
};
type Book = {
  listingId: string;
  tokenTicker: string;
  legalName: string;
  refPrice: number;
  lastPrice: number;
  spread: number | null;
  asks: Level[];
  bids: Level[];
  trades: { id: string; price: number; amount: number; buyer?: string; seller?: string; createdAt: string }[];
  myOrders: MyOrder[];
  reservedCash?: number;
  reservedTokens?: number;
  /** 'sdex' is the real Stellar order book; 'sandbox' is the local matcher. */
  venue: 'sdex' | 'sandbox';
  /** SDEX only: whether the issuer has authorized this holder's trustline. */
  authorized?: boolean;
  needsTrustline?: boolean;
  tokenBalance?: number;
};

/** Shape returned by /api/sdex/:id, before we fold it into `Book`. */
type SdexLevel = { price: number; amount: number; total: number };
type SdexOffer = {
  id: string;
  selling: { asset_code?: string; asset_type: string };
  buying: { asset_code?: string; asset_type: string };
  amount: number;
  price: number;
};

/**
 * Folds an SDEX response into the shape the book UI already renders.
 *
 * Two mismatches to reconcile: SDEX reports `total` as a cumulative quantity
 * while the sandbox reports it as a notional value, and SDEX has no depth
 * percentage because Horizon does not compute one.
 */
function fromSdex(d: any): Book {
  const level = (rows: SdexLevel[]): Level[] => {
    const max = Math.max(1, ...rows.map((r) => r.amount));
    return rows.map((r) => ({
      price: r.price,
      amount: r.amount,
      total: r.price * r.amount,
      depthPercent: Math.round((r.amount / max) * 100),
    }));
  };

  const ticker: string = d.tokenTicker;
  const myOrders: MyOrder[] = (d.myOffers || []).map((o: SdexOffer) => {
    // An offer selling the security is a sell; anything else in this market
    // is buying it.
    const side: 'BUY' | 'SELL' = o.selling?.asset_code === ticker ? 'SELL' : 'BUY';
    return {
      id: o.id,
      side,
      price: side === 'SELL' ? o.price : o.price === 0 ? 0 : 1 / o.price,
      amount: o.amount,
      remaining: o.amount,
      status: 'OPEN',
    };
  });

  return {
    listingId: d.listingId,
    tokenTicker: ticker,
    legalName: d.legalName,
    refPrice: d.refPrice,
    lastPrice: d.lastPrice,
    spread: d.spread,
    asks: level(d.asks || []),
    bids: level(d.bids || []),
    trades: d.trades || [],
    myOrders,
    venue: 'sdex',
    authorized: d.authorized,
    needsTrustline: d.needsTrustline,
    tokenBalance: d.tokenBalance,
  };
}

/** Which resting level the form price came from, so we can show what is left to take. */
type TakenLevel = { from: 'ask' | 'bid'; price: number; available: number };

const fmtQty = (n: number) =>
  n.toLocaleString('es-AR', { maximumFractionDigits: 4, minimumFractionDigits: 0 });

export default function OrderbookPage() {
  return (
    <Suspense fallback={<p className="py-16 text-center text-neutral-500">Cargando orderbook…</p>}>
      <OrderbookInner />
    </Suspense>
  );
}

function OrderbookInner() {
  const params = useSearchParams();
  const { user, token, refreshUser, approveToken } = useAuth();
  const [markets, setMarkets] = useState<Market[]>([]);
  const [listingId, setListingId] = useState(params.get('listing') || '');
  const [book, setBook] = useState<Book | null>(null);
  const [side, setSide] = useState<'BUY' | 'SELL'>('BUY');
  const [price, setPrice] = useState(10);
  const [amount, setAmount] = useState(1);
  const [taken, setTaken] = useState<TakenLevel | null>(null);
  const [notice, setNotice] = useState('');
  const amountInput = useRef<HTMLInputElement>(null);

  const holding = user?.holdings?.find((h) => h.listingId === listingId);
  const onSdex = book?.venue === 'sdex';

  // On SDEX the ledger is the authority, not our database: the trustline's
  // authorized flag is literally what decides whether Stellar accepts the
  // order, so reading anything else would let the UI promise a trade the
  // network will reject.
  const approved = onSdex ? Boolean(book?.authorized) : user?.kycStatus === 'APPROVED';
  const needsTrustline = onSdex
    ? Boolean(book?.needsTrustline)
    : side === 'BUY' && approved && !user?.trustlines?.includes(listingId);

  const loadMarkets = async () => {
    const json = await fetch(`${API_BASE_URL}/api/orderbook/markets`).then((r) => r.json()).catch(() => null);
    if (Array.isArray(json?.data)) setMarkets(json.data.filter((m: Market) => isVisibleListing(m.listingId)));
  };

  /**
   * Prefers the real Stellar order book and falls back to the local matcher.
   *
   * SDEX only answers for listings that already have an issuing account on the
   * network, so a demo running without testnet keys still gets a working book
   * instead of an error.
   */
  const loadBook = async (id: string) => {
    if (!id) return;
    const auth = bearerHeaders(token);

    const sdex = await fetch(`${API_BASE_URL}/api/sdex/${id}`, { headers: auth })
      .then((r) => r.json())
      .catch(() => null);
    if (sdex?.success) {
      setBook(fromSdex(sdex.data));
      return;
    }

    const local = await fetch(`${API_BASE_URL}/api/orderbook/${id}`, { headers: auth })
      .then((r) => r.json())
      .catch(() => null);
    if (local?.success) setBook({ ...local.data, venue: 'sandbox' });
  };

  useEffect(() => {
    loadMarkets();
  }, []);

  useEffect(() => {
    if (!listingId && markets[0]) setListingId(markets[0].listingId);
  }, [markets, listingId]);

  useVisibleInterval(
    () => loadBook(listingId),
    4000,
    Boolean(listingId),
    `${listingId}:${token || ''}`,
  );

  useEffect(() => {
    if (book?.lastPrice) setPrice(book.lastPrice);
    setTaken(null);
  }, [book?.listingId]);

  const openOrders = useMemo(
    () => (book?.myOrders || []).filter((o) => o.status === 'OPEN' || o.status === 'PARTIAL'),
    [book?.myOrders]
  );

  // The backend reserves cash against resting buys in *every* market, so take its numbers
  // rather than deriving them from myOrders, which only covers the listing on screen.
  const reservedCash = book?.reservedCash ?? 0;
  const reservedTokens = book?.reservedTokens ?? 0;

  const freeCash = Math.max(0, Number(user?.cashUsdc || 0) - reservedCash);
  // On SDEX the balance comes from the trustline, and Stellar already nets out
  // what resting offers have locked, so there is nothing to subtract.
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

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotice('');
    const onSdex = book?.venue === 'sdex';
    try {
      const res = await fetch(
        onSdex
          ? `${API_BASE_URL}/api/sdex/${listingId}/orders`
          : `${API_BASE_URL}/api/orderbook/${listingId}/orders`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          // SDEX names the size `quantity`; the sandbox book calls it `amount`.
          body: JSON.stringify(onSdex ? { side, price, quantity: amount } : { side, price, amount }),
        },
      );
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.message || 'No se pudo cargar la orden');
      setTaken(null);
      await refreshUser();

      if (onSdex) {
        setBook(fromSdex(json.data.book));
        setNotice(`Orden enviada al DEX de Stellar. Hash ${String(json.data.hash).slice(0, 12)}…`);
      } else {
        setBook({ ...json.data.book, venue: 'sandbox' });
        setNotice(
          json.data.order.status === 'FILLED'
            ? 'Orden ejecutada. Tokens y USDC actualizados.'
            : 'Orden en el libro. Espera contraparte.',
        );
      }
    } catch (err: any) {
      setNotice(err.message);
    }
  };

  const cancel = async (id: string) => {
    if (book?.venue === 'sdex') {
      // On SDEX a cancel is an offer for zero, so it needs the original side
      // and price to identify and zero out the resting offer.
      const mine = book.myOrders.find((o) => o.id === id);
      if (!mine) return;
      const res = await fetch(`${API_BASE_URL}/api/sdex/${listingId}/orders/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ side: mine.side, offerId: id, price: mine.price }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setNotice(json.message || 'No se pudo cancelar la orden');
        return;
      }
      await submitSigned(json.data.xdr);
      await loadBook(listingId);
      refreshUser();
      return;
    }

    const res = await fetch(`${API_BASE_URL}/api/orderbook/orders/${id}/cancel`, {
      method: 'POST',
      headers: bearerHeaders(token),
    });
    const json = await res.json();
    if (json.success) {
      setBook({ ...json.data.book, venue: 'sandbox' });
      refreshUser();
    }
  };

  /** Relays an already-signed transaction. Used by the self-custody paths. */
  const submitSigned = async (xdr: string) => {
    const res = await fetch(`${API_BASE_URL}/api/sdex/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ xdr }),
    });
    const json = await res.json();
    if (!res.ok || !json.success) throw new Error(json.message || 'No se pudo enviar a Stellar');
    return json.data;
  };

  const total = useMemo(() => price * amount, [price, amount]);

  // Asks arrive ascending; render them descending so the best ask sits against the spread row.
  const asksDisplay = useMemo(() => (book ? [...book.asks].reverse() : []), [book?.asks]);

  return (
    <div className="space-y-6 py-4">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <p className="font-lcd text-[11px] uppercase tracking-[0.2em] text-neutral-500">Mercado secundario</p>
          <h1 className="text-2xl sm:text-3xl font-extrabold font-display">
            {onSdex ? 'Order book Stellar' : 'Orderbook local'}
          </h1>
          <p className="text-neutral-600 mt-1 max-w-xl">
            {onSdex
              ? 'Puntas del DEX nativo de Stellar (CLOB, sin AMM). Solo cuentas con KYC aprobado y trustline autorizada pueden comprar, vender o transferir.'
              : book
                ? 'Libro local de demo mientras el listing no tiene cuenta emisora en Stellar. Comprador y vendedor con KYC.'
                : 'Elegí un token. Si el listing tiene emisor en Stellar, cotiza en el DEX nativo; si no, usamos el libro local de demo.'}
          </p>
        </div>
        <div className="flex items-center gap-2 px-3 py-2 rounded-2xl crystal-card text-sm">
          <ShieldCheck className="w-4 h-4" />
          {onSdex ? 'KYC on-chain · AUTH_REQUIRED' : 'Doble KYC'}
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {markets.length === 0 && (
          <p className="text-sm text-neutral-500">
            Todavía no hay tokens para negociar.{' '}
            <Link href="/market" className="underline font-bold">Abrí o suscribí una licitación</Link>.
          </p>
        )}
        {markets.map((m) => (
          <button
            key={m.listingId}
            type="button"
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
              <span className="font-display font-extrabold break-words">{book.tokenTicker} · {book.legalName}</span>
              <span className="font-mono text-xs text-neutral-500 shrink-0">
                Último ${book.lastPrice.toFixed(2)}
                {book.spread != null ? ` · spread $${book.spread.toFixed(2)}` : ''}
              </span>
            </div>

            <PriceSparkline trades={book.trades} refPrice={book.refPrice} />

            <p className="text-[11px] text-neutral-500 inline-flex items-center gap-1.5">
              <MousePointerClick className="w-3.5 h-3.5 shrink-0" />
              Tocá una punta para tomar su precio. Después elegís la cantidad.
            </p>

            <div className="py-2.5 px-4 rounded-xl bg-black/[0.04] flex flex-col gap-1 sm:flex-row sm:justify-between sm:items-center font-mono">
              <span className="text-base font-bold">${book.lastPrice.toFixed(2)}</span>
              <span className="text-[11px] text-neutral-500 inline-flex items-center gap-1">
                <ArrowUpRight className="w-3.5 h-3.5" /> Referencia IPO ${book.refPrice.toFixed(2)}
              </span>
            </div>

            {/* Compradores a la izquierda, vendedores a la derecha. */}
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wide text-[#2f6f28] mb-1">Compras</p>
                <div className="grid grid-cols-3 text-[11px] font-mono text-neutral-500 uppercase">
                  <span>Precio</span>
                  <span className="text-right">Cant.</span>
                  <span className="text-right">Total</span>
                </div>
                <div className="space-y-1 font-mono text-xs mt-1">
                  {book.bids.length === 0 && <p className="text-neutral-400">Sin compras abiertas</p>}
                  {book.bids.map((bid) => (
                    <button
                      key={`b-${bid.price}`}
                      type="button"
                      onClick={() => takeLevel('bid', bid)}
                      title={`Vender a $${bid.price.toFixed(2)} · ${fmtQty(bid.amount)} demandados`}
                      className={`w-full grid grid-cols-3 p-1.5 rounded relative overflow-hidden text-[#2f6f28] text-left cursor-pointer transition hover:bg-emerald-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                        taken?.from === 'bid' && taken.price === bid.price ? 'ring-2 ring-emerald-600 bg-emerald-50' : ''
                      }`}
                    >
                      <div className="absolute right-0 top-0 bottom-0 bg-emerald-100 pointer-events-none" style={{ width: `${bid.depthPercent}%` }} />
                      <span className="font-bold relative z-10">${bid.price.toFixed(2)}</span>
                      <span className="text-right relative z-10">{fmtQty(bid.amount)}</span>
                      <span className="text-right relative z-10 text-neutral-500">${bid.total.toLocaleString()}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-[11px] font-bold uppercase tracking-wide text-red-700 mb-1">Ventas</p>
                <div className="grid grid-cols-3 text-[11px] font-mono text-neutral-500 uppercase">
                  <span>Precio</span>
                  <span className="text-right">Cant.</span>
                  <span className="text-right">Total</span>
                </div>
                <div className="space-y-1 font-mono text-xs mt-1">
                  {asksDisplay.length === 0 && <p className="text-neutral-400">Sin ventas abiertas</p>}
                  {asksDisplay.map((ask) => (
                    <button
                      key={`a-${ask.price}`}
                      type="button"
                      onClick={() => takeLevel('ask', ask)}
                      title={`Comprar a $${ask.price.toFixed(2)} · ${fmtQty(ask.amount)} disponibles`}
                      className={`w-full grid grid-cols-3 p-1.5 rounded relative overflow-hidden text-red-700 text-left cursor-pointer transition hover:bg-red-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-400 ${
                        taken?.from === 'ask' && taken.price === ask.price ? 'ring-2 ring-red-500 bg-red-50' : ''
                      }`}
                    >
                      <div className="absolute right-0 top-0 bottom-0 bg-red-100 pointer-events-none" style={{ width: `${ask.depthPercent}%` }} />
                      <span className="font-bold relative z-10">${ask.price.toFixed(2)}</span>
                      <span className="text-right relative z-10">{fmtQty(ask.amount)}</span>
                      <span className="text-right relative z-10 text-neutral-500">${ask.total.toLocaleString()}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {book.trades.length > 0 && (
              <div className="pt-2 border-t border-black/10 space-y-1">
                <p className="text-xs font-bold">Últimas operaciones</p>
                <div className="grid grid-cols-4 text-[10px] font-mono text-neutral-500 uppercase">
                  <span>Precio</span>
                  <span className="text-right">Cant.</span>
                  <span className="text-right">Comprador</span>
                  <span className="text-right">Vendedor</span>
                </div>
                {book.trades.slice(0, 12).map((t) => (
                  <div key={t.id} className="grid grid-cols-4 text-[11px] font-mono text-neutral-700 py-0.5 border-b border-black/5 last:border-0">
                    <span className="font-bold">${t.price.toFixed(2)}</span>
                    <span className="text-right">{fmtQty(t.amount)}</span>
                    <span className="text-right text-[#2f6f28]" title={t.buyer}>{t.buyer ? `${t.buyer.slice(0, 4)}…${t.buyer.slice(-4)}` : '—'}</span>
                    <span className="text-right text-red-700" title={t.seller}>{t.seller ? `${t.seller.slice(0, 4)}…${t.seller.slice(-4)}` : '—'}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="lg:col-span-4 p-6 rounded-3xl crystal-card space-y-5">
            <h3 className="font-display font-extrabold">Orden límite</h3>
            <p className="text-xs text-neutral-500">
              Saldo ${freeCash.toLocaleString('es-AR', { maximumFractionDigits: 2 })} USDC
              {holding ? ` · ${fmtQty(freeTokens)} ${book.tokenTicker}` : ''}
              {reservedCash + reservedTokens > 0 ? ' (libre, sin contar órdenes abiertas)' : ''}
            </p>
            <div className="p-1 rounded-xl bg-black/[0.04] flex gap-1">
              <button
                type="button"
                onClick={() => { setSide('BUY'); setTaken(null); }}
                className={`flex-1 py-2 rounded-lg text-xs font-bold ${side === 'BUY' ? 'bg-[#4ea743] text-black' : 'text-neutral-500'}`}
              >
                Comprar
              </button>
              <button
                type="button"
                onClick={() => { setSide('SELL'); setTaken(null); }}
                className={`flex-1 py-2 rounded-lg text-xs font-bold ${side === 'SELL' ? 'bg-red-500 text-white' : 'text-neutral-500'}`}
              >
                Vender
              </button>
            </div>
            <form onSubmit={submit} className="space-y-4">
              <label className="block text-xs space-y-1">
                Precio (USDC)
                <input
                  type="number"
                  step="0.01"
                  min={0.01}
                  value={price}
                  onChange={(e) => { setPrice(Number(e.target.value)); setTaken(null); }}
                  className="w-full px-3 py-2.5 rounded-xl border border-black/10 font-mono"
                />
              </label>

              {taken && (
                <div className="px-3 py-2 rounded-xl bg-black/[0.04] text-[11px] space-y-1.5">
                  <p>
                    Tomando punta {taken.from === 'ask' ? 'vendedora' : 'compradora'} a{' '}
                    <span className="font-mono font-bold">${taken.price.toFixed(2)}</span> ·{' '}
                    <span className="font-mono">{fmtQty(taken.available)}</span>{' '}
                    {taken.from === 'ask' ? 'disponibles' : 'demandados'}
                  </p>
                  <button
                    type="button"
                    onClick={() => applyQty(Math.min(taken.available, maxQty))}
                    className="underline font-bold"
                  >
                    Tomar toda la punta
                  </button>
                </div>
              )}

              <label className="block text-xs space-y-1">
                Cantidad
                <input
                  ref={amountInput}
                  type="number"
                  step="0.0001"
                  min={0.0001}
                  value={amount}
                  onChange={(e) => setAmount(Number(e.target.value))}
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
                    {f === 1 ? 'Máx' : `${f * 100}%`}
                  </button>
                ))}
              </div>

              <p className="text-sm font-mono">Total ${total.toFixed(2)} USDC</p>
              {amount > maxQty + 1e-9 && (
                <p className="text-xs text-red-600">
                  Te excedés: máximo {fmtQty(maxQty)} {side === 'BUY' ? `a $${price.toFixed(2)}` : book.tokenTicker}
                </p>
              )}
              {!approved && (
                <p className="text-sm text-neutral-600">
                  Solo cuentas con KYC aprobado operan.{' '}
                  <Link href="/login" className="underline font-bold">Iniciar sesión</Link>
                </p>
              )}
              {needsTrustline && (
                <div className="px-3 py-2.5 rounded-xl bg-amber-50 border border-amber-200 text-xs space-y-2">
                  <p>Para recibir {book.tokenTicker} necesitás aprobar el token (trustline).</p>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await approveToken(listingId);
                        setNotice(`${book.tokenTicker} aprobado. Ya podés comprar.`);
                      } catch (err: any) {
                        setNotice(err.message);
                      }
                    }}
                    className="px-3 py-1.5 rounded-lg bg-black text-white font-bold"
                  >
                    Aprobar {book.tokenTicker}
                  </button>
                </div>
              )}
              {notice && (
                <p className="text-sm flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" /> {notice}
                </p>
              )}
              <button
                type="submit"
                disabled={!approved || needsTrustline}
                className={`w-full py-3 rounded-2xl font-display font-bold text-sm inline-flex items-center justify-center gap-2 disabled:opacity-40 ${
                  side === 'BUY' ? 'bg-black text-white' : 'bg-red-600 text-white'
                }`}
              >
                <Zap className="w-4 h-4" />
                {side === 'BUY' ? 'Publicar compra' : 'Publicar venta'}
              </button>
            </form>
            {openOrders.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-black/10">
                <p className="text-xs font-bold">Tus órdenes</p>
                {openOrders.map((o) => (
                  <div key={o.id} className="flex justify-between items-center text-xs">
                    <span>{o.side} {fmtQty(o.remaining)} @ ${o.price}</span>
                    <button type="button" onClick={() => cancel(o.id)} className="underline">Cancelar</button>
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

/**
 * Línea de tendencia del precio: polilínea SVG de los últimos trades.
 * Con pocos trades dibuja de todas formas — arranca en el precio de
 * referencia (IPO) para que siempre haya una línea visible.
 */
function PriceSparkline({ trades, refPrice }: { trades: { price: number; createdAt: string }[]; refPrice: number }) {
  const points = useMemo(() => {
    const sorted = [...(trades || [])].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
    const prices = [refPrice, ...sorted.map((t) => t.price)];
    return prices.slice(-40);
  }, [trades, refPrice]);

  const w = 600;
  const h = 80;
  const pad = 6;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const step = points.length > 1 ? (w - pad * 2) / (points.length - 1) : 0;
  const path = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${(pad + i * step).toFixed(1)},${(h - pad - ((p - min) / range) * (h - pad * 2)).toFixed(1)}`)
    .join(' ');

  const first = points[0];
  const last = points[points.length - 1];
  const up = last >= first;

  return (
    <div className="rounded-2xl border border-black/10 bg-white/60 p-3">
      <div className="flex items-center justify-between text-[11px] text-neutral-500 mb-1">
        <span className="uppercase tracking-wider font-lcd">Tendencia</span>
        <span className={`font-mono font-bold ${up ? 'text-[#3f8f38]' : 'text-red-600'}`}>
          {up ? '▲' : '▼'} ${last.toFixed(2)}
        </span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-20" preserveAspectRatio="none" role="img">
        <path d={path} fill="none" stroke={up ? '#3f8f38' : '#dc2626'} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
    </div>
  );
}
