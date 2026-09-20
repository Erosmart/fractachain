'use client';

import React, { useState } from 'react';
import {
  FileText,
  ShieldCheck,
  Building,
  TrendingUp,
  DollarSign,
  AlertCircle,
  CheckCircle2,
  Lock,
  ArrowRight,
  Zap,
} from 'lucide-react';
import MockDisclaimer from '../../components/MockDisclaimer';
import { useI18n } from '../../context/I18nContext';

interface WarrantRecord {
  id: string;
  certificateNumber: string;
  warehouseCompany: string;
  commodity: 'Soja' | 'Maíz' | 'Trigo';
  tons: number;
  marketPriceUsd: number;
  collateralValueUsd: number;
  loanAmountUsd: number;
  ltvPercent: number;
  healthFactor: number;
  status: 'ACTIVE' | 'LIQUIDATED' | 'REDEEMED';
}

const MOCK_WARRANTS: WarrantRecord[] = [
  {
    id: 'WAR-9643-001',
    certificateNumber: 'CD-CU-2026-9481',
    warehouseCompany: 'Control Union Argentina S.A. (Almacén Gral. Depósito)',
    commodity: 'Soja',
    tons: 1000,
    marketPriceUsd: 310,
    collateralValueUsd: 310000,
    loanAmountUsd: 170500,
    ltvPercent: 55,
    healthFactor: 1.36,
    status: 'ACTIVE',
  },
  {
    id: 'WAR-9643-002',
    certificateNumber: 'CD-SGS-2026-1120',
    warehouseCompany: 'SGS Argentina Warrant S.A.',
    commodity: 'Maíz',
    tons: 2500,
    marketPriceUsd: 175,
    collateralValueUsd: 437500,
    loanAmountUsd: 240625,
    ltvPercent: 55,
    healthFactor: 1.36,
    status: 'ACTIVE',
  },
];

export default function WarrantsPage() {
  const { t } = useI18n();
  // Calculator state
  const [calcCommodity, setCalcCommodity] = useState<'Soja' | 'Maíz' | 'Trigo'>('Soja');
  const [calcTons, setCalcTons] = useState<number>(500);
  const [calcLtv, setCalcLtv] = useState<number>(55);
  const [issuedSuccess, setIssuedSuccess] = useState<string | null>(null);

  const priceMap = { Soja: 310, Maíz: 175, Trigo: 220 };
  const currentPrice = priceMap[calcCommodity];
  const collateralValue = calcTons * currentPrice;
  const loanCapacity = collateralValue * (calcLtv / 100);
  const liquidationThresholdUsd = collateralValue * 0.75;

  const handleCreateWarrant = () => {
    setIssuedSuccess(`Simulación: préstamo de $${loanCapacity.toLocaleString()} USDC contra ${calcTons} Tn de ${calcCommodity}. No se envió transacción a Stellar.`);
    setTimeout(() => setIssuedSuccess(null), 4000);
  };

  return (
    <div className="space-y-8 py-4">
      {/* Header */}
      <div className="space-y-2">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-leaf-100 border border-[#8fcb7a]/40 text-[#2f6f28] text-xs font-semibold uppercase tracking-wider">
          <FileText className="w-3.5 h-3.5" />
          Régimen Nacional Ley 9643
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-black tracking-tight">
          {t('pages.warrantsTitle')}
        </h1>
        <p className="text-neutral-600 text-xs sm:text-sm max-w-2xl">
          Monetiza granos almacenados en silobolsas y plantas de acopio autorizadas. Obtén liquidez inmediata en USDC con una relación préstamo-valor (LTV) del 50% al 60% bajo custodia de Empresas de Warrants registradas.
        </p>
        <MockDisclaimer product="Warrants" />
      </div>

      {/* Regulatory Badge */}
      <div className="p-5 rounded-3xl crystal-card flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <span className="text-xs font-bold text-black flex items-center gap-1.5">
            <Building className="w-4 h-4 text-[#2f6f28]" />
            Certificación de Almacén General de Depósito
          </span>
          <p className="text-xs text-neutral-600 max-w-2xl">
            Los títulos se emiten duplicados: Certificado de Depósito (acredita propiedad) y Warrant (acredita derecho creditorio y prenda comercial) de acuerdo con la Ley 9643 y reglamentaciones del SAGyP.
          </p>
        </div>
        <span className="px-3 py-1 rounded-full bg-leaf-100 text-[#2f6f28] border border-[#8fcb7a]/50 text-xs font-mono font-bold whitespace-nowrap">
          warrant_vault.wasm
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left: Active Warrants List (7 Cols) */}
        <div className="lg:col-span-7 space-y-4">
          <h3 className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Warrants Activos en Bóveda</h3>

          <div className="space-y-3">
            {MOCK_WARRANTS.map((war) => (
              <div
                key={war.id}
                className="p-4 sm:p-5 rounded-3xl crystal-card hover:border-black/20 transition-all space-y-3"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:justify-between sm:items-start">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-black text-base font-mono">{war.id}</span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-leaf-100 text-[#2f6f28] border border-[#8fcb7a]/50 max-w-full truncate">
                        {war.certificateNumber}
                      </span>
                    </div>
                    <div className="text-xs text-neutral-600 mt-0.5 break-words">{war.warehouseCompany}</div>
                  </div>

                  <span className="self-start px-2.5 py-1 rounded-md bg-leaf-100 text-[#2f6f28] border border-[#8fcb7a]/50 text-xs font-mono font-bold shrink-0">
                    LTV {war.ltvPercent}%
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2 border-t border-black/8 text-xs">
                  <div>
                    <span className="text-neutral-500 text-[10px] block">Colateral ({war.commodity})</span>
                    <span className="font-bold font-mono text-black break-words">{war.tons} Tn (${war.collateralValueUsd.toLocaleString()})</span>
                  </div>
                  <div>
                    <span className="text-neutral-500 text-[10px] block">Préstamo USDC Otorgado</span>
                    <span className="font-bold font-mono text-[#2f6f28]">${war.loanAmountUsd.toLocaleString()}</span>
                  </div>
                  <div>
                    <span className="text-neutral-500 text-[10px] block">Salud de Colateral</span>
                    <span className="font-bold font-mono text-black">{war.healthFactor}x (Seguro)</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Loan Calculator & Warrant Origination (5 Cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="p-6 sm:p-8 rounded-3xl crystal-card space-y-6">
            <h3 className="text-base font-bold text-black">Calculadora de Préstamo con Warrants</h3>

            {/* Commodity Select */}
            <div className="space-y-1.5">
              <label className="text-xs text-neutral-600 font-medium">Commodity en Silobolsa</label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {(['Soja', 'Maíz', 'Trigo'] as const).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCalcCommodity(c)}
                    className={`py-2 px-2 rounded-xl text-xs font-semibold border transition-all ${
                      calcCommodity === c
                        ? 'bg-leaf-100 border-[#7ed86a] text-[#2f6f28]'
                        : 'bg-white/70 border-black/10 text-neutral-500'
                    }`}
                  >
                    <span className="sm:hidden">{c}</span>
                    <span className="hidden sm:inline">{c} (${priceMap[c]}/Tn)</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Tons Input */}
            <div className="space-y-1.5">
              <label className="text-xs text-neutral-600 font-medium">Cantidad de Toneladas Depositadas</label>
              <input
                type="number"
                min="50"
                step="50"
                value={calcTons}
                onChange={(e) => setCalcTons(Math.max(50, Number(e.target.value)))}
                className="w-full px-3.5 py-2.5 rounded-xl bg-white/70 border border-black/10 focus:border-[#7ed86a] focus:outline-none text-black text-xs font-mono font-bold"
              />
            </div>

            {/* LTV Slider (50% - 60%) */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-neutral-500">LTV Solicitado:</span>
                <span className="font-mono font-bold text-[#2f6f28]">{calcLtv}% LTV</span>
              </div>
              <input
                type="range"
                min="50"
                max="60"
                step="1"
                value={calcLtv}
                onChange={(e) => setCalcLtv(Number(e.target.value))}
                className="w-full accent-[#7ed86a] h-2 rounded-lg cursor-pointer"
              />
              <div className="flex flex-col gap-0.5 sm:flex-row sm:justify-between text-[10px] text-neutral-500 font-mono">
                <span>50% (Conservador)</span>
                <span className="hidden sm:inline">55% (Estándar)</span>
                <span>60% (Máximo Ley 9643)</span>
              </div>
            </div>

            {/* Loan Calculation Summary */}
            <div className="p-4 rounded-xl bg-black/5 border border-black/8 space-y-2 text-xs font-mono">
              <div className="flex justify-between text-neutral-500">
                <span>Valor del Grano:</span>
                <span className="text-black">${collateralValue.toLocaleString()} USD</span>
              </div>
              <div className="flex justify-between text-neutral-500">
                <span>Préstamo a Recibir (USDC):</span>
                <span className="text-[#2f6f28] font-bold">${loanCapacity.toLocaleString()} USDC</span>
              </div>
              <div className="flex justify-between text-neutral-500 text-[10px] pt-1 border-t border-black/8">
                <span>Precio de Liquidación (75% LTV):</span>
                <span className="text-red-700">${(currentPrice * 0.75).toFixed(1)} USD/Tn</span>
              </div>
            </div>

            {issuedSuccess && (
              <div className="p-3 rounded-xl bg-leaf-100 border border-[#8fcb7a]/50 text-[#2f6f28] text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{issuedSuccess}</span>
              </div>
            )}

            {/* Action */}
            <button
              type="button"
              onClick={handleCreateWarrant}
              className="w-full py-3 rounded-xl bg-black text-white font-bold text-xs flex items-center justify-center gap-2 transition-all"
            >
              <Zap className="w-4 h-4" />
              Simular préstamo (no on-chain)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
