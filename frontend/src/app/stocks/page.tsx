'use client';

import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  ShieldCheck,
  Lock,
  ArrowRight,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  DollarSign,
  CheckCircle2,
  Building2,
  Layers,
  FileText,
  ExternalLink,
  Zap,
} from 'lucide-react';
import { StockCustody, API_BASE_URL } from '../../lib/api';
import MockDisclaimer from '../../components/MockDisclaimer';
import { useI18n } from '../../context/I18nContext';

const DEFAULT_STOCKS: StockCustody[] = [
  {
    symbol: 'tYPF',
    companyName: 'YPF S.A. (Clase D)',
    tickerMerval: 'YPFD',
    cajaDeValoresSubaccount: '84920-CV',
    isin: 'ARP700011037',
    totalSharesInCustody: 150000,
    tokensCirculating: 150000,
    backingRatio: 1.0,
    lastAuditTimestamp: new Date().toISOString().split('T')[0] + ' 10:00 UTC',
    auditor: 'PricewaterhouseCoopers (PwC) / CNV',
    priceUsd: 28.50,
    change24h: 3.2,
  },
  {
    symbol: 'tGGAL',
    companyName: 'Grupo Financiero Galicia S.A.',
    tickerMerval: 'GGAL',
    cajaDeValoresSubaccount: '84920-CV',
    isin: 'ARP432631215',
    totalSharesInCustody: 220000,
    tokensCirculating: 220000,
    backingRatio: 1.0,
    lastAuditTimestamp: new Date().toISOString().split('T')[0] + ' 10:00 UTC',
    auditor: 'PricewaterhouseCoopers (PwC) / CNV',
    priceUsd: 41.20,
    change24h: -1.1,
  },
  {
    symbol: 'tPAMP',
    companyName: 'Pampa Energía S.A.',
    tickerMerval: 'PAMP',
    cajaDeValoresSubaccount: '84920-CV',
    isin: 'ARP733691060',
    totalSharesInCustody: 85000,
    tokensCirculating: 85000,
    backingRatio: 1.0,
    lastAuditTimestamp: new Date().toISOString().split('T')[0] + ' 10:00 UTC',
    auditor: 'PricewaterhouseCoopers (PwC) / CNV',
    priceUsd: 54.80,
    change24h: 1.8,
  },
];

function normalizeStock(raw: any): StockCustody | null {
  const symbol = String(raw?.symbol || raw?.tokenTicker || '').trim();
  if (!symbol) return null;
  return {
    symbol,
    companyName: raw.companyName || '',
    tickerMerval: raw.tickerMerval || raw.ticker || '',
    cajaDeValoresSubaccount: raw.cajaDeValoresSubaccount || '84920-CV',
    isin: raw.isin || '',
    totalSharesInCustody: Number(raw.totalSharesInCustody ?? raw.custodiedSharesInCajaDeValores ?? 0),
    tokensCirculating: Number(raw.tokensCirculating ?? raw.mintedTokensInStellar ?? 0),
    backingRatio: Number(raw.backingRatio ?? 1),
    lastAuditTimestamp: raw.lastAuditTimestamp || '',
    auditor: raw.auditor || 'PwC / CNV',
    priceUsd: Number(raw.priceUsd ?? raw.priceUsdc ?? 0),
    change24h: Number(raw.change24h ?? raw.change24hPct ?? 0),
  };
}

export default function StocksPage() {
  const { t } = useI18n();
  const [stocks, setStocks] = useState<StockCustody[]>(DEFAULT_STOCKS);
  const [selectedStock, setSelectedStock] = useState<StockCustody>(DEFAULT_STOCKS[0]);
  const [orderType, setOrderType] = useState<'BUY' | 'SELL'>('BUY');
  const [sharesAmount, setSharesAmount] = useState<number>(10);
  const [isTrading, setIsTrading] = useState<boolean>(false);
  const [tradeSuccess, setTradeSuccess] = useState<string | null>(null);
  const [destokenizeModal, setDestokenizeModal] = useState<boolean>(false);
  const [alycAccount, setAlycAccount] = useState<string>('ALYC-Balanz-49201');

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/custody/stocks`)
      .then((res) => res.json())
      .then((data) => {
        if (data?.data && Array.isArray(data.data)) {
          const mapped = data.data.map(normalizeStock).filter((s: StockCustody | null): s is StockCustody => Boolean(s));
          if (mapped.length) {
            setStocks(mapped);
            setSelectedStock(mapped[0]);
          }
        }
      })
      .catch(() => {
        // Fallback to default stocks
      });
  }, []);

  const totalCostUsd = sharesAmount * selectedStock.priceUsd;

  const handleExecuteTrade = () => {
    setIsTrading(true);
    setTradeSuccess(null);
    setTimeout(() => {
      setIsTrading(false);
      setTradeSuccess(`Simulación: ${orderType === 'BUY' ? 'compra' : 'venta'} de ${sharesAmount} ${selectedStock.symbol}. No se envió transacción. El mercado vivo es Licitaciones / Orderbook.`);
    }, 1200);
  };

  return (
    <div className="space-y-8 py-4">
      {/* Header */}
      <div className="space-y-2">
        <div className="inline-flex max-w-full flex-wrap items-center gap-1.5 px-3 py-1 rounded-full bg-leaf-100 border border-[#8fcb7a]/40 text-[#2f6f28] text-xs font-semibold uppercase tracking-wider">
          <TrendingUp className="w-3.5 h-3.5 shrink-0" />
          Mercado Secundario Merval
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-black tracking-tight">
          {t('pages.stocksTitle')}
        </h1>
        <p className="text-neutral-600 text-xs sm:text-sm max-w-2xl">
          Opera títulos líderes del panel principal de Bolsas y Mercados Argentinos (BYMA) con respaldo real e inmovilización en subcuenta comitente de Caja de Valores S.A.
        </p>
        <MockDisclaimer product="Merval" />
      </div>

      {/* Proof of Reserve (PoR) Card */}
      <div className="p-6 rounded-3xl crystal-card space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-leaf-100 border border-[#8fcb7a]/40 flex items-center justify-center text-[#2f6f28]">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-black">Prueba de Reserva en Tiempo Real (Proof of Reserve - PoR)</h3>
              <p className="text-[11px] text-neutral-500">Auditoría criptográfica y conciliación diaria con Caja de Valores S.A.</p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-leaf-100 text-[#2f6f28] border border-[#8fcb7a]/50 text-[11px] font-mono font-bold">
            <CheckCircle2 className="w-3.5 h-3.5" /> 100.00% RESPALDADO 1:1
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2 text-xs">
          <div className="p-3 rounded-xl bg-black/5 border border-black/8 min-w-0">
            <span className="text-[10px] text-neutral-500 block">Subcuenta Comitente</span>
            <span className="font-mono font-semibold text-black break-words">84920-CV (Segregada)</span>
          </div>
          <div className="p-3 rounded-xl bg-black/5 border border-black/8">
            <span className="text-[10px] text-neutral-500 block">Auditor Externo</span>
            <span className="font-semibold text-[#2f6f28]">PwC / CNV RG 1150</span>
          </div>
          <div className="p-3 rounded-xl bg-black/5 border border-black/8">
            <span className="text-[10px] text-neutral-500 block">Última Conciliación</span>
            <span className="font-mono text-neutral-700">Hoy 10:00 UTC</span>
          </div>
          <div className="p-3 rounded-xl bg-black/5 border border-black/8">
            <span className="text-[10px] text-neutral-500 block">Liquidación</span>
            <span className="font-mono text-[#2f6f28] font-bold">Inmediata T+0</span>
          </div>
        </div>
      </div>

      {/* Stocks Grid & Trading Terminal */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left: Stock Cards */}
        <div className="lg:col-span-7 space-y-4">
          <h3 className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Activos Disponibles</h3>
          
          <div className="space-y-3">
            {stocks.map((stock) => {
              const isSelected = selectedStock.symbol === stock.symbol;
              const isPositive = stock.change24h >= 0;

              return (
                <div
                  key={stock.symbol}
                  onClick={() => setSelectedStock(stock)}
                  className={`p-4 sm:p-5 rounded-3xl crystal-card cursor-pointer transition-all flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between ${
                    isSelected ? 'ring-1 ring-[#7ed86a]' : 'hover:border-black/20'
                  }`}
                >
                  <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                    <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-leaf-100 border border-[#8fcb7a]/40 flex items-center justify-center font-bold text-black font-mono text-base shrink-0">
                      {(stock.symbol.startsWith('t') ? stock.symbol.slice(1) : stock.symbol).slice(0, 4)}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-black text-base">{stock.symbol}</span>
                        <span className="text-xs text-neutral-500 font-mono">({stock.tickerMerval})</span>
                        <span className="px-2 py-0.5 rounded text-[9px] font-mono bg-leaf-100 text-[#2f6f28] border border-[#8fcb7a]/50">
                          1:1 Custodia
                        </span>
                      </div>
                      <div className="text-xs text-neutral-600 truncate">{stock.companyName}</div>
                      <div className="text-[10px] text-neutral-500 font-mono mt-0.5">ISIN: {stock.isin}</div>
                    </div>
                  </div>

                  <div className="text-left sm:text-right space-y-1 pl-14 sm:pl-0 shrink-0">
                    <div className="font-mono font-bold text-black text-base">
                      ${stock.priceUsd.toFixed(2)} <span className="text-xs text-neutral-500 font-sans">USD</span>
                    </div>
                    <div
                      className={`inline-flex items-center gap-0.5 text-xs font-mono font-bold ${
                        isPositive ? 'text-[#2f6f28]' : 'text-red-700'
                      }`}
                    >
                      {isPositive ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                      {isPositive ? `+${stock.change24h}%` : `${stock.change24h}%`}
                    </div>
                    <div className="text-[10px] text-neutral-500 font-mono block">
                      En Custodia: {stock.totalSharesInCustody.toLocaleString()}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Dividend Pass-Through Card */}
          <div className="p-5 rounded-3xl crystal-card space-y-3">
            <h4 className="text-xs font-bold text-black uppercase tracking-wider flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-[#2f6f28]" />
              Distribución Automática de Dividendos en USDC
            </h4>
            <p className="text-xs text-neutral-600 leading-relaxed">
              Cuando una sociedad cotizante paga dividendos en dólares o pesos convertibles, el smart contract de Fractachain distribuye proporcionalmente USDC a cada tenedor en Stellar sin deducciones abusivas ni demoras bancarias.
            </p>
            <div className="p-3 rounded-xl bg-black/5 border border-black/8 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 text-xs">
              <span className="text-neutral-600">Último dividendo tYPF pagado:</span>
              <span className="font-mono font-bold text-[#2f6f28]">$0.85 USDC / token</span>
            </div>
          </div>
        </div>

        {/* Right: Trading Terminal */}
        <div className="lg:col-span-5 space-y-4">
          <div className="p-6 sm:p-8 rounded-3xl crystal-card space-y-6 sticky top-24">
            <div className="flex flex-col gap-1 sm:flex-row sm:justify-between sm:items-center">
              <h3 className="text-base font-bold text-black">Terminal de Negociación</h3>
              <span className="text-xs font-mono text-[#2f6f28] font-bold">
                {selectedStock.symbol} • ${selectedStock.priceUsd.toFixed(2)} USD
              </span>
            </div>

            {/* Buy / Sell Toggle */}
            <div className="p-1 rounded-xl bg-black/5 border border-black/8 flex gap-1">
              <button
                type="button"
                onClick={() => setOrderType('BUY')}
                className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
                  orderType === 'BUY'
                    ? 'bg-[#7ed86a] text-black shadow-md'
                    : 'text-neutral-500 hover:text-black'
                }`}
              >
                Comprar {selectedStock.symbol}
              </button>
              <button
                type="button"
                onClick={() => setOrderType('SELL')}
                className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
                  orderType === 'SELL'
                    ? 'bg-red-500 text-white shadow-md'
                    : 'text-neutral-500 hover:text-black'
                }`}
              >
                Vender {selectedStock.symbol}
              </button>
            </div>

            {/* Shares Input */}
            <div className="space-y-1.5">
              <div className="flex flex-col gap-0.5 sm:flex-row sm:justify-between text-xs">
                <span className="text-neutral-600 font-medium">Cantidad de Tokens (Acciones):</span>
                <span className="text-neutral-500 font-mono">Disponibles: 150,000</span>
              </div>
              <input
                type="number"
                min="1"
                max="10000"
                value={sharesAmount}
                onChange={(e) => setSharesAmount(Math.max(1, Number(e.target.value)))}
                className="w-full px-4 py-3 rounded-xl bg-white/70 border border-black/10 focus:border-[#7ed86a] focus:outline-none text-black font-mono font-bold text-base"
              />
            </div>

            {/* Price breakdown */}
            <div className="p-4 rounded-xl bg-black/5 border border-black/8 space-y-2 text-xs">
              <div className="flex justify-between text-neutral-500">
                <span>Precio Unitario:</span>
                <span className="font-mono text-black">${selectedStock.priceUsd.toFixed(2)} USDC</span>
              </div>
              <div className="flex justify-between text-neutral-500">
                <span>Comisión Protocolo (0.1%):</span>
                <span className="font-mono text-[#2f6f28]">${(totalCostUsd * 0.001).toFixed(2)} USDC</span>
              </div>
              <div className="flex justify-between text-black font-bold pt-2 border-t border-black/10 text-sm">
                <span>Total Estimado:</span>
                <span className="font-mono text-[#2f6f28]">${(totalCostUsd * 1.001).toFixed(2)} USDC</span>
              </div>
            </div>

            {/* Trade Feedback */}
            {tradeSuccess && (
              <div className="p-3 rounded-xl bg-leaf-100 border border-[#8fcb7a]/50 text-[#2f6f28] text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{tradeSuccess}</span>
              </div>
            )}

            {/* Action button */}
            <button
              type="button"
              disabled={isTrading}
              onClick={handleExecuteTrade}
              className={`w-full py-3.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-lg transition-all ${
                orderType === 'BUY'
                  ? 'bg-black text-white'
                  : 'bg-red-500 hover:bg-red-400 text-white'
              }`}
            >
              {isTrading ? (
                'Simulando (no on-chain)…'
              ) : (
                <>
                  <Zap className="w-4 h-4" />
                  {orderType === 'BUY' ? `Comprar ${sharesAmount} ${selectedStock.symbol}` : `Vender ${sharesAmount} ${selectedStock.symbol}`}
                </>
              )}
            </button>

            {/* Destokenization trigger */}
            <div className="pt-2 border-t border-black/8 text-center">
              <button
                type="button"
                onClick={() => setDestokenizeModal(!destokenizeModal)}
                className="text-xs text-neutral-500 hover:text-black underline transition-colors"
              >
                Solicitar Destokenización a Cuenta ALYC Tradicional
              </button>
            </div>

            {destokenizeModal && (
              <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 space-y-3 text-xs">
                <div className="flex items-center gap-2 text-amber-800 font-semibold">
                  <Building2 className="w-4 h-4" /> Retiro a Caja de Valores
                </div>
                <p className="text-[11px] text-neutral-600 leading-relaxed">
                  Tus tokens serán quemados en Soroban y las acciones físicas subyacentes serán transferidas desde la subcuenta 84920 a tu ALYC receptora autorizada.
                </p>
                <input
                  type="text"
                  value={alycAccount}
                  onChange={(e) => setAlycAccount(e.target.value)}
                  placeholder="Número de Comitente y ALYC"
                  className="w-full px-3 py-1.5 rounded-lg bg-white/70 border border-black/10 text-xs text-black"
                />
                <button
                  type="button"
                  onClick={() => {
                    alert('Solicitud de destokenización radicada. Proceso de liquidación CV: 24 horas hábiles.');
                    setDestokenizeModal(false);
                  }}
                  className="w-full py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-semibold text-xs transition-all"
                >
                  Enviar Orden de Destokenización
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
