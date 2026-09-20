'use client';

import { Globe2, ShieldCheck, Scale } from 'lucide-react';
import BrandLogo from './BrandLogo';
import { useI18n } from '../context/I18nContext';

function CnvMark() {
  const { messages } = useI18n();
  return (
    <div className="flex items-center gap-3 min-w-0">
      <BrandLogo
        slug="cnv"
        alt="CNV"
        className="h-12 w-12 object-contain shrink-0"
        fallback={
          <svg viewBox="0 0 64 64" className="h-12 w-12 shrink-0" aria-hidden>
            <circle cx="32" cy="32" r="30" fill="#0b3a6e" />
            <circle cx="32" cy="32" r="24" fill="none" stroke="#f4c430" strokeWidth="2.2" />
            <text x="32" y="28" textAnchor="middle" fill="#fff" fontSize="9" fontFamily="Georgia, serif" fontWeight="700">
              CNV
            </text>
            <text x="32" y="40" textAnchor="middle" fill="#f4c430" fontSize="5.2" fontFamily="Georgia, serif">
              ARGENTINA
            </text>
          </svg>
        }
      />
      <div className="leading-tight min-w-0">
        <div className="font-section font-extrabold text-black text-xs sm:text-sm">{messages.regulation.cnv}</div>
        <div className="text-[11px] text-neutral-500">{messages.regulation.cnvSub}</div>
      </div>
    </div>
  );
}

function CajaMark() {
  const { messages } = useI18n();
  return (
    <div className="flex items-center gap-3 min-w-0">
      <BrandLogo
        slug="caja-de-valores"
        alt="Caja de Valores"
        className="h-12 w-12 object-contain shrink-0"
        fallback={
          <svg viewBox="0 0 64 64" className="h-12 w-12 shrink-0" aria-hidden>
            <rect x="4" y="4" width="56" height="56" rx="8" fill="#113355" />
            <path d="M16 40V24l16-8 16 8v16l-16 8-16-8z" fill="none" stroke="#fff" strokeWidth="2" />
            <path d="M32 16v32" stroke="#7ed86a" strokeWidth="2" />
          </svg>
        }
      />
      <div className="leading-tight min-w-0">
        <div className="font-section font-extrabold text-black text-xs sm:text-sm">{messages.regulation.caja}</div>
        <div className="text-[11px] text-neutral-500">{messages.regulation.cajaSub}</div>
      </div>
    </div>
  );
}

export default function RegulationSection() {
  const { messages } = useI18n();
  const copy = messages.regulation;
  const icons = [ShieldCheck, Globe2, Scale] as const;

  return (
    <section className="rounded-2xl sm:rounded-3xl crystal-card p-5 sm:p-8 lg:p-12 space-y-6 sm:space-y-8">
      <div className="max-w-3xl space-y-3">
        <p className="font-lcd text-[11px] uppercase tracking-[0.22em] text-neutral-500">{copy.kicker}</p>
        <h2 className="font-section text-2xl sm:text-3xl lg:text-4xl font-extrabold text-black">
          {copy.title}
        </h2>
        <p className="text-neutral-600 text-sm sm:text-base leading-relaxed">
          {copy.body}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 sm:gap-6">
        <CnvMark />
        <CajaMark />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 pt-2">
        {copy.cards.map(([title, desc], i) => {
          const Icon = icons[i];
          return (
          <div key={title} className="space-y-2">
            <Icon className="w-5 h-5" />
            <h3 className="font-section font-extrabold text-black">{title}</h3>
            <p className="text-sm text-neutral-600 leading-relaxed">{desc}</p>
          </div>
          );
        })}
      </div>
    </section>
  );
}
