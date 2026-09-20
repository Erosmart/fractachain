'use client';

import React, { useState } from 'react';
import {
  Sprout,
  ShieldCheck,
  AlertTriangle,
  RefreshCw,
  Scale,
  FileText,
  CheckCircle2,
  Calendar,
  DollarSign,
  ArrowRight,
  Zap,
} from 'lucide-react';

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
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-950/60 border border-emerald-800/40 text-emerald-400 text-xs font-semibold uppercase tracking-wider">
          <Sprout className="w-3.5 h-3.5" />
          Marco Legal CCyC Art. 1131
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-black tracking-tight">
          Forwards Agropecuarios de Consumo
        </h1>
        <p className="text-neutral-600 text-xs sm:text-sm max-w-2xl">
          Contratos de compraventa futura de granos con cláusulas resolutorias automatizadas en smart contracts de Soroban para resarcimiento directo o refinanciación en especie.
        </p>
      </div>

      {/* Legal Banner */}
      <div className="p-5 rounded-2xl bg-[#0c101a] border border-white/5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <span className="text-xs font-bold text-white flex items-center gap-1.5">
            <Scale className="w-4 h-4 text-emerald-400" />
            Amparo del Código Civil y Comercial de la Nación
          </span>
          <p className="text-xs text-gray-400 max-w-2xl">
            Conforme al Art. 1131 del CCyC (Venta de cosas futuras), la promesa de entrega queda sujeta a la condición resolutoria de que la cosa llegue a existir. En Fractachain, se estipula contractualmente una penalidad rescisoria del 20% o el rollover en especie con bonificación del +10% en kilogramos.
          </p>
        </div>
        <span className="px-3 py-1 rounded-full bg-emerald-950/60 text-emerald-400 border border-emerald-800 text-xs font-mono font-bold whitespace-nowrap">
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
                  className={`p-4 sm:p-5 rounded-2xl border cursor-pointer transition-all space-y-3 ${
                    isSelected
                      ? 'bg-[#101726] border-emerald-500 shadow-lg shadow-emerald-500/10'
                      : 'bg-[#0c101a] border-white/5 hover:border-gray-700'
                  }`}
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:justify-between sm:items-start">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-white text-sm sm:text-base font-mono break-all">{fwd.id}</span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-950 text-blue-300 border border-blue-800">
                          {fwd.commodity}
                        </span>
                      </div>
                      <div className="text-xs text-gray-400 break-words">{fwd.producer}</div>
                    </div>

                    <span className="self-start px-2.5 py-1 rounded-md bg-emerald-950 text-emerald-400 border border-emerald-800 text-xs font-mono font-bold shrink-0">
                      ${fwd.strikePriceUsd} USD/Tn
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2 border-t border-white/5 text-xs">
                    <div>
                      <span className="text-gray-500 text-[10px] block">Volumen Comprometido</span>
                      <span className="font-bold font-mono text-white">{fwd.tons} Toneladas</span>
                    </div>
                    <div>
                      <span className="text-gray-500 text-[10px] block">Valor Nocional</span>
                      <span className="font-bold font-mono text-emerald-400">${fwdTotal.toLocaleString()} USDC</span>
                    </div>
                    <div>
                      <span className="text-gray-500 text-[10px] block">Fecha de Entrega</span>
                      <span className="font-bold font-mono text-gray-300">{fwd.deliveryDate}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Clause Execution & Rollover Simulator (5 Cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="p-6 sm:p-8 rounded-2xl bg-[#0c101a] border border-white/10 space-y-6 shadow-2xl">
            <h3 className="text-base font-bold text-white">Simulador de Resolución Contractual</h3>

            <div className="p-4 rounded-xl bg-[#121826] space-y-2 text-xs">
              <div className="text-gray-400">Contrato Seleccionado: <strong className="text-white font-mono">{selectedForward.id}</strong></div>
              <div className="text-gray-400">Valor Total de Entrega: <strong className="text-emerald-400 font-mono">${totalContractValue.toLocaleString()} USDC</strong></div>
            </div>

            {/* Resolution Mode Selection */}
            <div className="space-y-3">
              <label className="text-xs font-medium text-gray-300 block">
                Selecciona la Cláusula a Ejecutar:
              </label>

              {/* Option A: 20% Cancellation Penalty */}
              <div
                onClick={() => setResolutionAction('PENALTY')}
                className={`p-4 rounded-xl border cursor-pointer transition-all space-y-1.5 ${
                  resolutionAction === 'PENALTY'
                    ? 'bg-red-950/20 border-red-500 text-white'
                    : 'bg-[#121826] border-white/5 text-gray-400 hover:border-gray-700'
                }`}
              >
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <span className="font-bold text-xs text-red-400 flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> Cláusula de Rescisión (20%)
                  </span>
                  <span className="font-mono text-xs font-bold text-white">
                    -${penaltyAmount.toLocaleString()} USDC
                  </span>
                </div>
                <p className="text-[11px] text-gray-400">
                  En caso de rescisión unilateral por siniestro o default, el smart contract retiene el 20% del nocional como compensación por daños y perjuicios preacordados.
                </p>
              </div>

              {/* Option B: In-Kind Rollover */}
              <div
                onClick={() => setResolutionAction('ROLLOVER')}
                className={`p-4 rounded-xl border cursor-pointer transition-all space-y-1.5 ${
                  resolutionAction === 'ROLLOVER'
                    ? 'bg-emerald-950/20 border-emerald-500 text-white'
                    : 'bg-[#121826] border-white/5 text-gray-400 hover:border-gray-700'
                }`}
              >
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <span className="font-bold text-xs text-emerald-400 flex items-center gap-1">
                    <RefreshCw className="w-3.5 h-3.5 shrink-0" /> Rollover en Especie (+10% kg)
                  </span>
                  <span className="font-mono text-xs font-bold text-white">
                    {rolloverTons.toFixed(0)} Tn
                  </span>
                </div>
                <p className="text-[11px] text-gray-400">
                  Refinanciación acordada: el productor difiere la entrega a la siguiente campaña con una prima física del 10% adicional en granos para el inversor.
                </p>
              </div>
            </div>

            {/* Execution Result Feedback */}
            {actionDone && (
              <div className="p-3 rounded-xl bg-emerald-950/60 border border-emerald-500 text-emerald-300 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                <span>
                  {resolutionAction === 'PENALTY'
                    ? `Penalidad del 20% ($${penaltyAmount.toLocaleString()} USDC) ejecutada con éxito en Soroban.`
                    : `Rollover a siguiente campaña con +10% de grano (${rolloverTons} Tn) registrado en smart contract.`}
                </span>
              </div>
            )}

            {/* Submit Action */}
            <button
              type="button"
              disabled={resolutionAction === 'NONE'}
              onClick={handleExecuteResolution}
              className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition-all"
            >
              <Zap className="w-4 h-4" />
              Ejecutar Resolución en Smart Contract
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
