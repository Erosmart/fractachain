'use client';

import React from 'react';
import Link from 'next/link';
import { Zap, Droplets, ShieldCheck, ArrowRight, Activity, CheckCircle2, Sparkles } from 'lucide-react';

export default function LiquidityFirstBanner() {
  return (
    <section className="relative overflow-hidden rounded-2xl sm:rounded-3xl crystal-card p-5 sm:p-8 lg:p-12">
      <div className="absolute -top-20 -right-16 w-72 h-72 bg-leaf-200 rounded-full blur-3xl opacity-70 pointer-events-none" />
      <div className="relative z-10 space-y-6 sm:space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-3 sm:gap-4">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-black/10 text-neutral-600 text-xs font-section font-bold uppercase tracking-wider">
            <Droplets className="w-3.5 h-3.5" />
            Liquidez primero
          </div>
          <div className="font-lcd text-xs text-black border border-black/10 px-3 py-1 rounded-xl bg-white/80">
            T+0 · &lt; 4s
          </div>
        </div>
        <h2 className="font-section text-2xl sm:text-3xl lg:text-4xl font-extrabold text-black leading-snug max-w-3xl">
          Tokenizar sin mercado secundario no sirve.
        </h2>
        <p className="text-neutral-600 text-sm sm:text-base max-w-3xl leading-relaxed">
          Cada emisión nace con <strong className="text-black">orderbook</strong> y liquidez en Stellar. Entrás y salís
          cuando hace falta, con doble KYC.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5">
          {[
            [Zap, 'Burst loans', 'USDC o XLM al productor en segundos. Warrants Ley 9643.'],
            [Activity, 'CLOB 24/7', 'Orderbook P2P. Clearing 0.25%.'],
            [ShieldCheck, 'OPA on-chain', '50% dispara oferta; 95% squeeze-out.'],
          ].map(([Icon, t, d]) => (
            <div key={String(t)} className="p-5 rounded-2xl border border-black/10 bg-white/70 space-y-2">
              <Icon className="w-5 h-5" />
              <h3 className="font-section font-extrabold">{t as string}</h3>
              <p className="text-sm text-neutral-600">{d as string}</p>
            </div>
          ))}
        </div>
        <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center justify-between gap-3 border-t border-black/10 pt-4">
          <span className="text-xs text-neutral-500 flex items-center gap-2">
            <Sparkles className="w-4 h-4 shrink-0" /> Argentina Builder Challenge
          </span>
          <div className="flex flex-wrap gap-2 sm:gap-3">
            <Link href="/orderbook" className="flex-1 sm:flex-none justify-center px-5 py-2.5 btn-lcd btn-lcd-solid text-xs">
              Orderbook <ArrowRight className="w-3.5 h-3.5" />
            </Link>
            <Link href="/warrants" className="flex-1 sm:flex-none justify-center px-5 py-2.5 btn-lcd btn-lcd-ghost text-xs">
              Burst loan
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
