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
import LiveContractLink from '../../components/LiveContractLink';
import { useI18n } from '../../context/I18nContext';
import { formatInt } from '../../lib/format';

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
    deliveryDate: '2027-05-15',
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
    deliveryDate: '2027-08-30',
    penaltyClausePercent: 20,
    rolloverBonusPercent: 10,
    status: 'ACTIVE',
  },
];

export default function ForwardsPage() {
  const { t, locale } = useI18n();
  const comLabel = (c: string) =>
    t(c === 'Soja' ? 'misc.comSoja' : c === 'Maíz' ? 'misc.comMaiz' : 'misc.comTrigo');
  const fmtDate = (iso: string) =>
    new Date(`${iso}T12:00:00`).toLocaleDateString(locale === 'es' ? 'es-AR' : 'en-US', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
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
          {t('fwd.kicker')}
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-black tracking-tight">
          {t('pages.forwardsTitle')}
        </h1>
        <p className="text-neutral-600 text-xs sm:text-sm max-w-2xl">
          {t('fwd.lead')}
        </p>
        <MockDisclaimer product="Forwards" />
        <LiveContractLink kind="forward" />
      </div>

      {/* Legal Banner */}
      <div className="p-5 rounded-3xl crystal-card flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <span className="text-xs font-bold text-black flex items-center gap-1.5">
            <Scale className="w-4 h-4 text-[#2f6f28]" />
            {t('fwd.legalTitle')}
          </span>
          <p className="text-xs text-neutral-600 max-w-2xl">
            {t('fwd.legalBody')}
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
          <h3 className="text-xs font-bold text-neutral-500 uppercase tracking-wider">{t('fwd.active')}</h3>

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
                          {comLabel(fwd.commodity)}
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
                      <span className="text-neutral-500 text-[10px] block">{t('fwd.volume')}</span>
                      <span className="font-bold font-mono text-black">{fwd.tons} {t('fwd.tons')}</span>
                    </div>
                    <div>
                      <span className="text-neutral-500 text-[10px] block">{t('fwd.notional')}</span>
                      <span className="font-bold font-mono text-[#2f6f28]">${formatInt(fwdTotal)} USDC</span>
                    </div>
                    <div>
                      <span className="text-neutral-500 text-[10px] block">{t('fwd.delivery')}</span>
                      <span className="font-bold font-mono text-neutral-700">{fmtDate(fwd.deliveryDate)}</span>
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
            <h3 className="text-base font-bold text-black">{t('fwd.simulator')}</h3>

            <div className="p-4 rounded-xl bg-black/5 border border-black/8 space-y-2 text-xs">
              <div className="text-neutral-600">{t('fwd.selected')} <strong className="text-black font-mono">{selectedForward.id}</strong></div>
              <div className="text-neutral-600">{t('fwd.totalDelivery')} <strong className="text-[#2f6f28] font-mono">${formatInt(totalContractValue)} USDC</strong></div>
            </div>

            {/* Resolution Mode Selection */}
            <div className="space-y-3">
              <label className="text-xs font-medium text-neutral-600 block">
                {t('fwd.pickClause')}
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
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {t('fwd.penalty')}
                  </span>
                  <span className="font-mono text-xs font-bold text-black">
                    -${formatInt(penaltyAmount)} USDC
                  </span>
                </div>
                <p className="text-[11px] text-neutral-600">
                  {t('fwd.penaltyBody')}
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
                    <RefreshCw className="w-3.5 h-3.5 shrink-0" /> {t('fwd.rollover')}
                  </span>
                  <span className="font-mono text-xs font-bold text-black">
                    {rolloverTons.toFixed(0)} Tn
                  </span>
                </div>
                <p className="text-[11px] text-neutral-600">
                  {t('fwd.rolloverBody')}
                </p>
              </div>
            </div>

            {/* Execution Result Feedback */}
            {actionDone && (
              <div className="p-3 rounded-xl bg-leaf-100 border border-[#8fcb7a]/50 text-[#2f6f28] text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>
                  {resolutionAction === 'PENALTY'
                    ? t('fwd.simPenalty', { n: formatInt(penaltyAmount) })
                    : t('fwd.simRollover', { n: rolloverTons.toFixed(0) })}
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
              {t('fwd.simulate')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
