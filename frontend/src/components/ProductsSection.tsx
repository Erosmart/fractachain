import Link from 'next/link';
import { ArrowRight, ShoppingBasket, LineChart, Landmark, Info } from 'lucide-react';
import { getServerMessages } from '../lib/i18n-server';

const ICONS = [ShoppingBasket, LineChart, Landmark];
const HREFS = ['/forwards', '/market', '/warrants'];

export default function ProductsSection() {
  const messages = getServerMessages();
  const copy = messages.products;

  return (
    <section className="space-y-6 sm:space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <p className="font-lcd text-[11px] uppercase tracking-[0.22em] text-neutral-500">{copy.kicker}</p>
          <h2 className="font-section text-2xl sm:text-3xl lg:text-4xl font-extrabold text-black mt-1">{copy.title}</h2>
        </div>
        <p className="text-sm text-neutral-600 max-w-md">
          {copy.lead}
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5">
        {copy.items.map((p, i) => {
          const Icon = ICONS[i];
          return (
          <article key={p.title} className="p-5 sm:p-7 rounded-2xl sm:rounded-3xl crystal-card flex flex-col space-y-4">
            <div className="flex items-center justify-between">
              <span className="font-lcd text-xs text-neutral-500">{p.kicker}</span>
              <Icon className="w-5 h-5 text-black" />
            </div>
            <h3 className="font-section text-xl font-extrabold text-black leading-tight">{p.title}</h3>
            <p className="font-semibold text-black">{p.lead}</p>
            <p className="text-neutral-600 flex-1 text-sm sm:text-base">
              {p.body}{' '}
              {p.tip && (
                <span className="group relative inline-flex align-middle">
                  <button
                    type="button"
                    aria-label={p.tip}
                    className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-black/20 text-neutral-500 transition-colors hover:border-black/40 hover:text-black"
                  >
                    <Info className="h-3 w-3" />
                  </button>
                  <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden w-64 -translate-x-1/2 rounded-xl border border-black/10 bg-white p-3 text-left text-xs font-normal leading-snug text-neutral-700 shadow-lg group-hover:block group-focus-within:block">
                    {p.tip}
                  </span>
                </span>
              )}
            </p>
            <Link href={HREFS[i]} className="inline-flex items-center gap-2 text-sm font-section font-bold text-black pt-2">
              {p.cta} <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </article>
          );
        })}
      </div>
    </section>
  );
}
