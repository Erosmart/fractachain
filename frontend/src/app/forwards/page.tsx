'use client';

import React, { useState } from 'react';
import {
  Sprout,
  AlertTriangle,
  RefreshCw,
  Scale,
  CheckCircle2,
  Zap,
} from 'lucide-react';
import MockDisclaimer from '../../components/MockDisclaimer';
import { useI18n } from '../../context/I18nContext';

interface ForwardContract {
  id: string;
  producer: string;
  commodity: 'Soja' | 'Maíz' | 'Trigo';
  tons: number;
  strikePriceUsd: number;
  deliveryDate: string;
  penaltyClausePercent: number;
  rolloverBonusPercent: number;
  status: 'ACTIVE' | 'SETTLED' | 'ROLLED_OVER' | 'CANCELLED';
}

const MOCK_FORWARDS: ForwardContract[] = [
  {
    id: 'FWD-SOJA-2026-01',
    producer: 'Agropecuaria Las Lilas S.A.',
    commodity: 'Soja',
    tons: 500,
    strikePriceUsd: 310,
    deliveryDate: '15 Mayo 2027',
    penaltyClausePercent: 20,
    rolloverBonusPercent: 10,
    status: 'ACTIVE',
  },
  {
    id: 'FWD-MAIZ-2026-04',
    producer: 'Don Horacio Cereales S.R.L.',
    commodity: 'Maíz',
    tons: 1200,
    strikePriceUsd: 175,
    deliveryDate: '30 Agosto 2027',
    penaltyClausePercent: 20,
    rolloverBonusPercent: 10,
    status: 'ACTIVE',
  },
];

export default function ForwardsPage() {
  const { t } = useI18n();
  const [selectedForward, setSelectedForward] = useState<ForwardContract>(MOCK_FORWARDS[0]);
  const [resolutionAction, setResolutionAction] = useState<'NONE' | 'PENALTY' | 'ROLLOVER'>('NONE');
  const [actionDone, setActionDone] = useState(false);

  const totalContractValue = selectedForward.tons * selectedForward.strikePriceUsd;
  const penaltyAmount = totalContractValue * (selectedForward.penaltyClausePercent / 100);
  const rolloverTons = selectedForward.tons * (1 + selectedForward.rolloverBonusPercent / 100);

  const handleExecuteResolution = () => {
    setActionDone(true);
    setTimeout(() => {
      setActionDone(false);
      setResolutionAction('NONE');
    }, 4000);
  };

  return (
    <div className="space-y-8 py-4">
      {/* Header */}
      <div className="space-y-2">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-leaf-100 border border-[#8fcb7a]/40 text-[#2f6f28] text-xs font-semibold uppercase tracking-wider">
          <Sprout className="w-3.5 h-3.5" />
          Marco Legal CCyC Art. 1131
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-black tracking-tight">
          {t('pages.forwardsTitle')}
        </h1>
        <p className="text-neutral-600 text-xs sm:text-sm max-w-2xl">
          Contratos de compraventa futura de granos con cláusulas resolutorias automatizadas en smart contracts de Soroban para resarcimiento directo o refinanciación en especie.
        </p>
        <MockDisclaimer product="Forwards" />
      </div>

      {/* Legal Banner */}
      <div className="p-5 rounded-3xl crystal-card flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <span className="text-xs font-bold text-black flex items-center gap-1.5">
            <Scale className="w-4 h-4 text-[#2f6f28]" />
            Amparo del Código Civil y Comercial de la Nación
          </span>
          <p className="text-xs text-neutral-600 max-w-2xl">
            Conforme al Art. 1131 del CCyC (Venta de cosas futuras), la promesa de entrega queda sujeta a la condición resolutoria de que la cosa llegue a existir. En Fractachain, se estipula contractualmente una penalidad rescisoria del 20% o el rollover en especie con bonificación del +10% en kilogramos.
          </p>
        </div>
        <span className="px-3 py-1 rounded-full bg-leaf-100 text-[#2f6f28] border border-[#8fcb7a]/50 text-xs font-mono font-bold whitespace-nowrap">
          forward_contract.wasm
        </span>
      </div>

      {/* Active Contracts & Resolution Simulator */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left: Contracts List (7 Cols) */}
        <div className="lg:col-span-7 space-y-4">
          <h3 className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Contratos Forwards Activos</h3>

          <div className="space-y-3">
            {MOCK_FORWARDS.map((fwd) => {
              const isSelected = selectedForward.id === fwd.id;
              const fwdTotal = fwd.tons * fwd.strikePriceUsd;

              return (
                <div
                  key={fwd.id}
                  onClick={() => setSelectedForward(fwd)}
                  className={`p-4 sm:p-5 rounded-3xl crystal-card cursor-pointer transition-all space-y-3 ${
                    isSelected ? 'ring-1 ring-[#7ed86a]' : 'hover:border-black/20'
                  }`}
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:justify-between sm:items-start">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-black text-sm sm:text-base font-mono break-all">{fwd.id}</span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-leaf-100 text-[#2f6f28] border border-[#8fcb7a]/50">
                          {fwd.commodity}
                        </span>
                      </div>
                      <div className="text-xs text-neutral-600 break-words">{fwd.producer}</div>
                    </div>

                    <span className="self-start px-2.5 py-1 rounded-md bg-leaf-100 text-[#2f6f28] border border-[#8fcb7a]/50 text-xs font-mono font-bold shrink-0">
                      ${fwd.strikePriceUsd} USD/Tn
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2 border-t border-black/8 text-xs">
                    <div>
                      <span className="text-neutral-500 text-[10px] block">Volumen Comprometido</span>
                      <span className="font-bold font-mono text-black">{fwd.tons} Toneladas</span>
                    </div>
                    <div>
                      <span className="text-neutral-500 text-[10px] block">Valor Nocional</span>
                      <span className="font-bold font-mono text-[#2f6f28]">${fwdTotal.toLocaleString()} USDC</span>
                    </div>
                    <div>
                      <span className="text-neutral-500 text-[10px] block">Fecha de Entrega</span>
                      <span className="font-bold font-mono text-neutral-700">{fwd.deliveryDate}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Clause Execution & Rollover Simulator (5 Cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="p-6 sm:p-8 rounded-3xl crystal-card space-y-6">
            <h3 className="text-base font-bold text-black">Simulador de Resolución Contractual</h3>

            <div className="p-4 rounded-xl bg-black/5 border border-black/8 space-y-2 text-xs">
              <div className="text-neutral-600">Contrato Seleccionado: <strong className="text-black font-mono">{selectedForward.id}</strong></div>
              <div className="text-neutral-600">Valor Total de Entrega: <strong className="text-[#2f6f28] font-mono">${totalContractValue.toLocaleString()} USDC</strong></div>
            </div>

            {/* Resolution Mode Selection */}
            <div className="space-y-3">
              <label className="text-xs font-medium text-neutral-600 block">
                Selecciona la Cláusula a Ejecutar:
              </label>

              {/* Option A: 20% Cancellation Penalty */}
              <div
                onClick={() => setResolutionAction('PENALTY')}
                className={`p-4 rounded-xl border cursor-pointer transition-all space-y-1.5 ${
                  resolutionAction === 'PENALTY'
                    ? 'bg-red-50 border-red-300 text-black'
                    : 'bg-black/5 border-black/8 text-neutral-600 hover:border-black/20'
                }`}
              >
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <span className="font-bold text-xs text-red-700 flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> Cláusula de Rescisión (20%)
                  </span>
                  <span className="font-mono text-xs font-bold text-black">
                    -${penaltyAmount.toLocaleString()} USDC
                  </span>
                </div>
                <p className="text-[11px] text-neutral-600">
                  En caso de rescisión unilateral por siniestro o default, el smart contract retiene el 20% del nocional como compensación por daños y perjuicios preacordados.
                </p>
              </div>

              {/* Option B: In-Kind Rollover */}
              <div
                onClick={() => setResolutionAction('ROLLOVER')}
                className={`p-4 rounded-xl border cursor-pointer transition-all space-y-1.5 ${
                  resolutionAction === 'ROLLOVER'
                    ? 'bg-leaf-100 border-[#7ed86a] text-black'
                    : 'bg-black/5 border-black/8 text-neutral-600 hover:border-black/20'
                }`}
              >
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <span className="font-bold text-xs text-[#2f6f28] flex items-center gap-1">
                    <RefreshCw className="w-3.5 h-3.5 shrink-0" /> Rollover en Especie (+10% kg)
                  </span>
                  <span className="font-mono text-xs font-bold text-black">
                    {rolloverTons.toFixed(0)} Tn
                  </span>
                </div>
                <p className="text-[11px] text-neutral-600">
                  Refinanciación acordada: el productor difiere la entrega a la siguiente campaña con una prima física del 10% adicional en granos para el inversor.
                </p>
              </div>
            </div>

            {/* Execution Result Feedback */}
            {actionDone && (
              <div className="p-3 rounded-xl bg-leaf-100 border border-[#8fcb7a]/50 text-[#2f6f28] text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>
                  {resolutionAction === 'PENALTY'
                    ? `Simulación: penalidad del 20% ($${penaltyAmount.toLocaleString()} USDC). No se envió transacción.`
                    : `Simulación: rollover +10% de grano (${rolloverTons} Tn). No se envió transacción.`}
                </span>
              </div>
            )}

            {/* Submit Action */}
            <button
              type="button"
              disabled={resolutionAction === 'NONE'}
              onClick={handleExecuteResolution}
              className="w-full py-3 rounded-xl bg-black text-white disabled:opacity-50 font-bold text-xs flex items-center justify-center gap-2 transition-all"
            >
              <Zap className="w-4 h-4" />
              Simular resolución (no on-chain)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
