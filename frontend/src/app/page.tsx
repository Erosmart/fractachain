'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import {
  TrendingUp,
  ShieldCheck,
  Zap,
  Layers,
  Sprout,
  ArrowRight,
  Calculator,
  Lock,
  Landmark,
  Globe2,
  CheckCircle2,
  Sparkles,
  Droplets,
} from 'lucide-react';
import DynamicHeroText from '../components/DynamicHeroText';
import ProductsSection from '../components/ProductsSection';
import RegulationSection from '../components/RegulationSection';
import MervalLogosSection from '../components/MervalLogosSection';
import LiquidityFirstBanner from '../components/LiquidityFirstBanner';
import ContractInspectorBanner from '../components/ContractInspectorBanner';
import PartnersShowcase from '../components/PartnersShowcase';
import IssuerCtaBanner from '../components/IssuerCtaBanner';
import { formatAmount } from '../lib/format';

export default function HomePage() {
  const [investmentAmount, setInvestmentAmount] = useState(5000);
  const [durationMonths, setDurationMonths] = useState(12);
  const [targetTna, setTargetTna] = useState(14.5);

  const results = {
    total: investmentAmount + investmentAmount * (targetTna / 100) * (durationMonths / 12),
    earnings: investmentAmount * (targetTna / 100) * (durationMonths / 12),
    monthly: (investmentAmount * (targetTna / 100) * (durationMonths / 12)) / durationMonths,
  };

  return (
    <div className="space-y-10 sm:space-y-16 lg:space-y-24">
      <section className="relative mx-auto flex min-h-0 sm:min-h-[calc(100svh-5.75rem)] max-w-5xl flex-col items-center justify-start sm:justify-center py-8 sm:py-10 pb-6 sm:pb-10 text-center">
        <div className="flex w-full flex-col items-center gap-4 sm:gap-5">
          <div className="inline-flex max-w-full flex-wrap items-center justify-center gap-2 px-3.5 py-1.5 rounded-full bg-white/70 border border-black/10 text-neutral-600 text-[11px] font-display font-bold uppercase tracking-[0.14em]">
            <Sparkles className="w-3.5 h-3.5 shrink-0" />
            <span className="text-left">Argentina Builder Challenge · Stellar</span>
          </div>
          <DynamicHeroText />
          <p className="hero-lead text-neutral-600 mx-auto px-1 text-sm sm:text-[1.05rem]">
            Financiamos producción real argentina — <strong className="text-black font-bold">granos, vinos, tabaco</strong> —
            y acciones del Merval con contratos en Stellar. Custodia 1:1 y marco CNV.
          </p>
          <div className="flex w-full flex-col sm:flex-row sm:flex-wrap lg:flex-nowrap items-stretch sm:items-center justify-center gap-2.5 pt-1 px-1">
            <Link
              href="/market"
              className="w-full sm:w-auto justify-center px-6 py-3 rounded-2xl bg-black text-white font-display font-bold text-sm flex items-center gap-2"
            >
              <Layers className="w-4 h-4 shrink-0" />
              Explorar licitaciones
            </Link>
            <Link
              href="/stocks"
              className="w-full sm:w-auto justify-center px-6 py-3 rounded-2xl bg-white/80 border border-black/10 text-black font-display font-bold text-sm flex items-center gap-2"
            >
              <TrendingUp className="w-4 h-4 shrink-0" />
              Acciones Merval
            </Link>
            <Link
              href="/orderbook"
              className="w-full sm:w-auto justify-center px-6 py-3 rounded-2xl bg-white/60 border border-black/10 text-black font-display font-semibold text-sm flex items-center gap-2"
            >
              <Droplets className="w-4 h-4 shrink-0" />
              Mercado secundario
            </Link>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 p-4 sm:p-6 rounded-2xl sm:rounded-3xl crystal-card text-left">
          {[
            ['TVL en custodia', '$2.450.000', 'USDC · PoR'],
            ['Grano respaldado', '12.400 Tn', 'Soja, maíz, vinos'],
            ['Rendimiento medio', '14.2%', 'TNA USD'],
            ['Liquidación', '< 4 s', 'Stellar T+0'],
          ].map(([k, v, s]) => (
            <div key={k} className="space-y-1 min-w-0">
              <span className="text-[10px] sm:text-xs text-neutral-500">{k}</span>
              <div className="text-lg sm:text-2xl font-display font-extrabold font-lcd text-black break-words">{v}</div>
              <span className="text-[10px] sm:text-[11px] text-neutral-500">{s}</span>
            </div>
          ))}
      </div>

      <div className="below-fold space-y-12 md:space-y-16 lg:space-y-24">
      <ProductsSection />
      <IssuerCtaBanner />
      <RegulationSection />
      <MervalLogosSection />

      <PartnersShowcase />
      <LiquidityFirstBanner />
      <ContractInspectorBanner />

      <section className="space-y-6 sm:space-y-8">
        <div className="text-center max-w-2xl mx-auto space-y-2 px-1">
          <h2 className="font-section text-2xl sm:text-3xl font-extrabold text-black">Producción y capital</h2>
          <p className="text-neutral-600 text-sm">Estructuras argentinas, liquidación global en Stellar.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
          <div className="p-5 sm:p-8 rounded-2xl sm:rounded-3xl crystal-card space-y-4 sm:space-y-5">
            <Sprout className="w-7 h-7" />
            <h3 className="font-section text-xl font-extrabold">Para productores</h3>
            <p className="text-sm text-neutral-600">Liquidez de campaña sin el banco de por medio.</p>
            <ul className="space-y-2 text-sm text-neutral-700">
              <li><strong className="text-black">Licitaciones:</strong> deuda en USDC o ARS.</li>
              <li><strong className="text-black">Forwards:</strong> 20% de resarcimiento o rollover +10% kg.</li>
              <li><strong className="text-black">Burst loans:</strong> warrants Ley 9643, LTV 50–60%.</li>
            </ul>
            <Link href="/market" className="inline-flex items-center gap-2 text-sm font-display font-bold">
              Publicar licitación <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          <div className="p-5 sm:p-8 rounded-2xl sm:rounded-3xl crystal-card space-y-4 sm:space-y-5">
            <TrendingUp className="w-7 h-7" />
            <h3 className="font-section text-xl font-extrabold">Para inversores</h3>
            <p className="text-sm text-neutral-600">Activos reales y Merval, 24/7.</p>
            <ul className="space-y-2 text-sm text-neutral-700">
              <li><strong className="text-black">tYPF / tGGAL:</strong> 1 token = 1 acción en Caja de Valores.</li>
              <li><strong className="text-black">Dividendos</strong> en el token de pago elegido.</li>
              <li><strong className="text-black">OPA / squeeze-out</strong> al 50% y 95%.</li>
            </ul>
            <Link href="/stocks" className="inline-flex items-center gap-2 text-sm font-display font-bold">
              Invertir <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </section>

      <section className="p-5 sm:p-8 lg:p-10 rounded-2xl sm:rounded-3xl crystal-card">
        <div className="max-w-4xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6 sm:gap-8 items-center">
          <div className="lg:col-span-7 space-y-5 sm:space-y-6">
            <div className="flex items-center gap-2 text-neutral-500 text-xs font-display font-bold uppercase tracking-wider">
              <Calculator className="w-4 h-4" /> Simulador
            </div>
            <h3 className="font-section text-2xl sm:text-3xl font-extrabold">Calculá el retorno</h3>
            <div className="space-y-2">
              <div className="flex justify-between text-xs gap-2">
                <span className="text-neutral-500">Monto</span>
                <span className="font-lcd font-bold shrink-0">${formatAmount(investmentAmount)} USDC</span>
              </div>
              <input
                type="range"
                min="500"
                max="50000"
                step="500"
                value={investmentAmount}
                onChange={(e) => setInvestmentAmount(Number(e.target.value))}
                className="w-full accent-black"
              />
            </div>
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              {[6, 12, 18].map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setDurationMonths(m)}
                  className={`p-2 sm:p-2.5 btn-lcd text-[10px] sm:text-xs ${
                    durationMonths === m ? 'btn-lcd-solid' : 'btn-lcd-ghost'
                  }`}
                >
                  {m} meses
                </button>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              {[12, 14.5, 17].map((rate) => (
                <button
                  key={rate}
                  type="button"
                  onClick={() => setTargetTna(rate)}
                  className={`p-2 btn-lcd text-[10px] sm:text-xs ${
                    targetTna === rate ? 'btn-lcd-solid' : 'btn-lcd-ghost'
                  }`}
                >
                  <span className="sm:hidden">{rate}%</span>
                  <span className="hidden sm:inline">{rate}% TNA USD</span>
                </button>
              ))}
            </div>
          </div>
          <div className="lg:col-span-5 p-5 sm:p-6 rounded-2xl border border-black/10 bg-white/80 space-y-4 sm:space-y-5">
            <span className="text-xs uppercase text-neutral-500 font-display font-bold">Estimado</span>
            <div className="font-lcd text-2xl sm:text-3xl font-bold text-black break-all">
              ${formatAmount(results.total, 2)}
            </div>
            <p className="text-xs text-neutral-500">
              Ganancia <strong className="text-black">+${formatAmount(results.earnings, 2)}</strong>
            </p>
            <Link href="/market" className="w-full py-3 btn-lcd btn-lcd-solid text-xs">
              Participar <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      <section className="space-y-5 sm:space-y-6">
        <h2 className="font-section text-2xl sm:text-3xl font-extrabold">Próximamente</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5">
          {(
            [
              [Landmark, 'Bonos soberanos', 'Bopreal / AL30 con cupón on-chain.'],
              [Layers, 'ETFs sectoriales', 'Agro, energía y bancos.'],
              [Globe2, 'Carbono agro', 'Siembra directa verificada.'],
            ] as [LucideIcon, string, string][]
          ).map(([Icon, t, d]) => (
            <div key={t} className="p-5 sm:p-6 rounded-2xl sm:rounded-3xl crystal-card space-y-3">
              <Icon className="w-5 h-5" />
              <h4 className="font-section font-extrabold">{t}</h4>
              <p className="text-sm text-neutral-600">{d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="p-5 sm:p-8 rounded-2xl sm:rounded-3xl crystal-card grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6">
        {(
          [
            [ShieldCheck, 'Sandbox CNV', 'RG 1150'],
            [Lock, 'Caja de Valores', 'Custodia 1:1'],
            [Zap, 'Stellar', 'Protocolo 27'],
            [CheckCircle2, 'GAFI', 'AML on-chain'],
          ] as [LucideIcon, string, string][]
        ).map(([Icon, t, s]) => (
          <div key={String(t)} className="flex items-center gap-3 min-w-0">
            <Icon className="w-6 h-6 shrink-0" />
            <div className="min-w-0">
              <div className="text-sm font-display font-bold">{t}</div>
              <div className="text-[11px] text-neutral-500">{s}</div>
            </div>
          </div>
        ))}
      </section>
      </div>
    </div>
  );
}
