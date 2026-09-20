'use client';

import Link from 'next/link';
import { ArrowRight, ShoppingBasket, LineChart, Landmark } from 'lucide-react';

const PRODUCTS = [
  {
    kicker: '01',
    title: 'Consumo',
    href: '/forwards',
    cta: 'Ver forwards',
    Icon: ShoppingBasket,
    lead: 'Contratos de producción para consumo, respaldados en blockchain.',
    body: 'Hoteles, gastronomía y mayoristas compran cosecha a futuro (vinos, tabaco, granos, hortalizas) con precio cerrado. El escrow vive en Soroban: si hay precancelación, el productor cobra la penalidad del 20%.',
  },
  {
    kicker: '02',
    title: 'Negociación de futuros de producción',
    href: '/market',
    cta: 'Ir a licitaciones',
    Icon: LineChart,
    lead: 'Contratos de producción a futuro que se licitan y se pueden negociar.',
    body: 'El productor abre una licitación primaria (soja, maíz, trigo, acopios). Los inversores suscriben en USDC, XLM o USDT. Después, las cuotapartes se venden en el orderbook secundario sin esperar la cosecha.',
  },
  {
    kicker: '03',
    title: 'Lending y stake',
    href: '/warrants',
    cta: 'Stake o préstamo',
    Icon: Landmark,
    lead: 'Stake de tokens de producción futura —o acciones— y préstamos contra stock tokenizado.',
    body: 'El inversor pone en stake tokens de producción futura, o cualquier acción tokenizada del Merval, y cobra una renta diaria. El productor, por su lado, tokeniza producción (warrants Ley 9643) y pide un préstamo: liquidez inmediata, sin banco, LTV 50–60%, liquidación T+0.',
  },
];

export default function ProductsSection() {
  return (
    <section className="space-y-6 sm:space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <p className="font-lcd text-[11px] uppercase tracking-[0.22em] text-neutral-500">Productos</p>
          <h2 className="font-section text-2xl sm:text-3xl lg:text-4xl font-extrabold text-black mt-1">Tres puertas al mismo riel</h2>
        </div>
        <p className="text-sm text-neutral-600 max-w-md">
          Consumo, futuros licitables, stake y crédito contra producción. Todo liquida on-chain.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5">
        {PRODUCTS.map((p) => (
          <article key={p.title} className="p-5 sm:p-7 rounded-2xl sm:rounded-3xl crystal-card flex flex-col space-y-4">
            <div className="flex items-center justify-between">
              <span className="font-lcd text-xs text-neutral-500">{p.kicker}</span>
              <p.Icon className="w-5 h-5 text-black" />
            </div>
            <h3 className="font-section text-xl font-extrabold text-black leading-tight">{p.title}</h3>
            <p className="font-semibold text-black">{p.lead}</p>
            <p className="text-neutral-600 flex-1 text-sm sm:text-base">{p.body}</p>
            <Link href={p.href} className="inline-flex items-center gap-2 text-sm font-section font-bold text-black pt-2">
              {p.cta} <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}
