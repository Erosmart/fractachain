'use client';

import Link from 'next/link';
import { MERVAL_NAMES } from '../lib/merval';
import BrandLogo from './BrandLogo';
import { useI18n } from '../context/I18nContext';

function StockCard({
  ticker,
  name,
}: {
  ticker: string;
  name: string;
}) {
  return (
    <Link
      href="/stocks"
      aria-label={name}
      className="flex items-center justify-center h-[88px] min-w-[140px] px-4 shrink-0"
    >
      <BrandLogo
        slug={ticker.toLowerCase()}
        alt={name}
        className="h-14 w-auto max-w-[140px] object-contain"
      />
    </Link>
  );
}

export default function MervalLogosSection() {
  const { t } = useI18n();
  const loop = [...MERVAL_NAMES, ...MERVAL_NAMES];

  return (
    <section className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <p className="font-lcd text-[11px] uppercase tracking-[0.22em] text-neutral-500">{t('merval.kicker')}</p>
          <h2 className="font-section text-3xl sm:text-4xl font-extrabold text-black mt-1">
            {t('merval.title')}
          </h2>
        </div>
        <p className="text-sm text-neutral-600 max-w-md">
          {t('merval.lead')}
        </p>
      </div>
      <div className="merval-reel">
        <div className="merval-reel-track">
          {loop.map((c, i) => (
            <StockCard key={`${c.ticker}-${i}`} ticker={c.ticker} name={c.name} />
          ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-3">
        <Link href="/stocks" className="px-6 py-3.5 rounded-2xl bg-black text-white font-section font-bold text-sm">
          {t('merval.ctaStocks')}
        </Link>
        <Link href="/market" className="px-6 py-3.5 rounded-2xl bg-white/80 border border-black/10 text-black font-section font-bold text-sm">
          {t('merval.ctaBonds')}
        </Link>
      </div>
    </section>
  );
}
