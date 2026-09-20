'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Layers, TrendingUp, ArrowRight } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import WalletAddress from '../../components/WalletAddress';
import { API_BASE_URL } from '../../lib/api';
import { formatAmount } from '../../lib/format';

type Position = {
  listingId: string;
  tokenTicker: string;
  legalName: string;
  shares: number;
  tokens: number;
  tokensOwed: number;
  costBasis: number;
  marketPrice: number;
  marketValue: number;
  pnl: number;
  pnlPct: number;
  priceSourceLabel: string;
  pendingDividendUsdc: number;
};

type Portfolio = {
  cashUsdc: number;
  positions: Position[];
  totals: {
    costBasis: number;
    marketValue: number;
    pnl: number;
    pnlPct: number;
    pendingDividends: number;
  };
};

function money(n: number, digits = 2) {
  return formatAmount(n, digits);
}

export default function DashboardPage() {
  const { user, token, approveToken, claimTokens, claimDividends } = useAuth();
  const [book, setBook] = useState<Portfolio | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    if (!token) return;
    const res = await fetch(`${API_BASE_URL}/api/portfolio`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .catch(() => null);
    if (res?.success && res.data) setBook(res.data);
  };

  useEffect(() => {
    load();
  }, [token, user?.holdings?.length, user?.cashUsdc]);

  const holdings = book?.positions?.length
    ? book.positions
    : (user?.holdings || []).map((h) => ({
        listingId: h.listingId,
        tokenTicker: h.tokenTicker,
        legalName: h.tokenTicker,
        shares: h.tokens + (h.tokensOwed || 0),
        tokens: h.tokens,
        tokensOwed: h.tokensOwed || 0,
        costBasis: h.usdcAmount,
        marketPrice: 0,
        marketValue: h.usdcAmount,
        pnl: 0,
        pnlPct: 0,
        priceSourceLabel: 'Cargando cotización…',
        pendingDividendUsdc: h.pendingDividendUsdc || 0,
      }));

  const totals = book?.totals || {
    costBasis: holdings.reduce((s, h) => s + h.costBasis, 0),
    marketValue: holdings.reduce((s, h) => s + h.marketValue, 0),
    pnl: 0,
    pnlPct: 0,
    pendingDividends: holdings.reduce((s, h) => s + (h.pendingDividendUsdc || 0), 0),
  };

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
      await load();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-8 py-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="font-lcd text-[11px] uppercase tracking-[0.22em] text-neutral-500">Portfolio</p>
          <h1 className="text-2xl sm:text-3xl font-extrabold font-display text-black break-words">Hola, {user?.legalName || user?.name}</h1>
          <p className="text-neutral-600 mt-1">
            Cuenta verificada. Custodia {user?.custodyMode === 'SELF' ? 'propia' : 'en Fractachain'}.
          </p>
        </div>
        <div className="p-4 rounded-2xl crystal-card max-w-lg">
          <p className="text-[11px] uppercase tracking-wider text-neutral-500 font-display font-bold mb-1">Tu wallet</p>
          <WalletAddress address={user?.publicKey} />
        </div>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-3xl crystal-card">
          <div className="text-xs text-neutral-500">Saldo USDC</div>
          <div className="text-2xl font-lcd font-bold">${money(Number(user?.cashUsdc || book?.cashUsdc || 0))}</div>
        </div>
        <div className="p-5 rounded-3xl crystal-card">
          <div className="text-xs text-neutral-500">Valorizado a mercado</div>
          <div className="text-2xl font-lcd font-bold">${money(totals.marketValue)}</div>
          <div className={`text-xs mt-1 ${totals.pnl >= 0 ? 'text-[#2f6f28]' : 'text-red-700'}`}>
            {totals.pnl >= 0 ? '+' : ''}{money(totals.pnl)} USDC ({totals.pnlPct >= 0 ? '+' : ''}{totals.pnlPct}%)
          </div>
        </div>
        <div className="p-5 rounded-3xl crystal-card">
          <div className="text-xs text-neutral-500">Costo (suscripto)</div>
          <div className="text-2xl font-lcd font-bold">${money(totals.costBasis)}</div>
        </div>
        <div className="p-5 rounded-3xl crystal-card">
          <div className="text-xs text-neutral-500">Dividendos a cobrar</div>
          <div className="text-2xl font-lcd font-bold">${money(totals.pendingDividends)}</div>
          <div className="text-xs text-neutral-500 mt-1">{holdings.length} posiciones</div>
        </div>
      </div>

      {holdings.length === 0 ? (
        <div className="p-8 rounded-3xl crystal-card text-center space-y-3">
          <p className="text-neutral-600">Todavía no tenés posiciones. Cuando suscribás, aparecen acá valorizadas al precio de mercado.</p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link href="/market" className="px-5 py-3 rounded-2xl bg-black text-white font-display font-bold text-sm inline-flex items-center gap-2">
              <Layers className="w-4 h-4" /> Licitaciones <ArrowRight className="w-4 h-4" />
            </Link>
            <Link href="/stocks" className="px-5 py-3 rounded-2xl border border-black/10 font-display font-bold text-sm inline-flex items-center gap-2">
              <TrendingUp className="w-4 h-4" /> Acciones Merval
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <h2 className="font-section text-xl font-extrabold">Posiciones valorizadas</h2>
          {holdings.map((h) => {
            const approved = user?.trustlines?.includes(h.listingId);
            const up = h.pnl >= 0;
            return (
              <div key={h.listingId} className="p-5 rounded-3xl crystal-card space-y-3">
                <div className="flex justify-between gap-3">
                  <div>
                    <div className="font-display font-extrabold">{h.tokenTicker}</div>
                    <p className="text-sm text-neutral-600">{h.legalName}</p>
                    <p className="text-sm text-neutral-600 mt-1">
                      {h.shares.toFixed(4)} acciones · en wallet {h.tokens.toFixed(4)}
                      {h.tokensOwed > 0 ? ` · pendientes ${h.tokensOwed.toFixed(4)}` : ''}
                    </p>
                    <p className="text-xs text-neutral-500">
                      Precio actual ${money(h.marketPrice)} · {h.priceSourceLabel}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="font-lcd font-bold">${money(h.marketValue)}</div>
                    <div className={`text-xs font-bold ${up ? 'text-[#2f6f28]' : 'text-red-700'}`}>
                      {up ? '+' : ''}{money(h.pnl)} ({up ? '+' : ''}{h.pnlPct}%)
                    </div>
                    <div className="text-[11px] text-neutral-500">costo ${money(h.costBasis)}</div>
                  </div>
                </div>
                {h.pendingDividendUsdc > 0 && (
                  <p className="text-sm text-[#2f6f28] font-bold">
                    Dividendo pendiente: ${money(h.pendingDividendUsdc)} USDC
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  {!approved && (
                    <button
                      type="button"
                      disabled={busy === h.listingId}
                      onClick={() => run(h.listingId, () => approveToken(h.listingId))}
                      className="px-4 py-2 rounded-xl bg-black text-white text-xs font-display font-bold"
                    >
                      Aprobar recepción (trustline)
                    </button>
                  )}
                  {approved && h.tokensOwed > 0 && (
                    <button
                      type="button"
                      disabled={busy === h.listingId}
                      onClick={() => run(h.listingId, () => claimTokens(h.listingId))}
                      className="px-4 py-2 rounded-xl border border-black/10 text-xs font-display font-bold"
                    >
                      Reclamar tokens
                    </button>
                  )}
                  {h.pendingDividendUsdc > 0 && (
                    <button
                      type="button"
                      disabled={busy === `div-${h.listingId}`}
                      onClick={() => run(`div-${h.listingId}`, () => claimDividends(h.listingId))}
                      className="px-4 py-2 rounded-xl bg-black text-white text-xs font-display font-bold"
                    >
                      Cobrar dividendo
                    </button>
                  )}
                  <Link href={`/orderbook?listing=${h.listingId}`} className="px-4 py-2 rounded-xl border border-black/10 text-xs font-display font-bold inline-flex items-center gap-1">
                    Negociar <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
