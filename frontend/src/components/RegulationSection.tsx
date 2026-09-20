'use client';

import { Globe2, ShieldCheck, Scale } from 'lucide-react';
import BrandLogo from './BrandLogo';

function CnvMark() {
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
        <div className="font-section font-extrabold text-black text-xs sm:text-sm">Comisión Nacional de Valores</div>
        <div className="text-[11px] text-neutral-500">Sandbox RG 1150 / 2026 · Ley 26.831</div>
      </div>
    </div>
  );
}

function CajaMark() {
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
        <div className="font-section font-extrabold text-black text-xs sm:text-sm">Caja de Valores S.A.</div>
        <div className="text-[11px] text-neutral-500">Custodia comitente 1:1</div>
      </div>
    </div>
  );
}

export default function RegulationSection() {
  return (
    <section className="rounded-2xl sm:rounded-3xl crystal-card p-5 sm:p-8 lg:p-12 space-y-6 sm:space-y-8">
      <div className="max-w-3xl space-y-3">
        <p className="font-lcd text-[11px] uppercase tracking-[0.22em] text-neutral-500">Marco legal</p>
        <h2 className="font-section text-2xl sm:text-3xl lg:text-4xl font-extrabold text-black">
          Respaldo CNV. Inversión global. 100% regulado.
        </h2>
        <p className="text-neutral-600 text-sm sm:text-base leading-relaxed">
          Fractachain no es un atajo informal. Opera bajo el sandbox de la <strong className="text-black">CNV</strong>,
          con valores y contratos alineados a la Ley de Mercado de Capitales, warrants Ley 9643 y forwards del Código
          Civil. Un inversor en Madrid, Miami o São Paulo puede suscribir en USDC sobre Stellar con el mismo marco que
          un comitente en Buenos Aires.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 sm:gap-6">
        <CnvMark />
        <CajaMark />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 pt-2">
        {(
          [
            [ShieldCheck, '100% regulado', 'PSAV, AML/CFT, KYC on-chain y time-lock horario ART. No hay tokens sueltos al margen de la CNV.'],
            [Globe2, 'Cualquier inversor del mundo', 'Liquidación T+0 en Stellar. El riel es global; el título sigue siendo argentino y custodiado.'],
            [Scale, 'Tres productos, un expediente', 'Consumo, futuros licitables y lending contra stock. Misma custodia, mismo regulador.'],
          ] as const
        ).map(([Icon, t, d]) => (
          <div key={t} className="space-y-2">
            <Icon className="w-5 h-5" />
            <h3 className="font-section font-extrabold text-black">{t}</h3>
            <p className="text-sm text-neutral-600 leading-relaxed">{d}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
