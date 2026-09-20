'use client';

import React, { useState } from 'react';
import {
  Activity,
  ShieldAlert,
  AlertTriangle,
  Scale,
  Users,
  CheckCircle2,
  Lock,
  ArrowRight,
  Zap,
} from 'lucide-react';

interface TokenHolder {
  address: string;
  name: string;
  tokensHeld: number;
  percentage: number;
  isDominant: boolean;
}

const INITIAL_HOLDERS: TokenHolder[] = [
  {
    address: 'GD6CGAZZY4Z2HQAIBL4RHJJWHJULLCO5F5XW6VL3CECJWLDBCDKWB7KR',
    name: 'Fondo de Inversión Agrícola Sur (Dominante)',
    tokensHeld: 262000,
    percentage: 52.4,
    isDominant: true,
  },
  {
    address: 'GB78A...9182',
    name: 'Cresud S.A.C.I.F. y A.',
    tokensHeld: 95000,
    percentage: 19.0,
    isDominant: false,
  },
  {
    address: 'GC23M...4419',
    name: 'Molinos Agro S.A.',
    tokensHeld: 60000,
    percentage: 12.0,
    isDominant: false,
  },
  {
    address: 'GDK81...5520',
    name: 'Minoristas en Stellar DEX (142 cuentas)',
    tokensHeld: 83000,
    percentage: 16.6,
    isDominant: false,
  },
];

export default function AdminOpaPage() {
  const [holders, setHolders] = useState<TokenHolder[]>(INITIAL_HOLDERS);
  const [dominantPercent, setDominantPercent] = useState<number>(52.4);
  const [opaState, setOpaState] = useState<'NORMAL' | 'OPA_ACTIVE' | 'SQUEEZE_OUT'>('OPA_ACTIVE');
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const handleTriggerOpa = () => {
    setOpaState('OPA_ACTIVE');
    setActionMessage('OPA Obligatoria activada por superar el 50% de tenencia (Art. 86 Ley 26.831). Período de 30 días hábiles abierto para retiro de minoritarios.');
    setTimeout(() => setActionMessage(null), 5000);
  };

  const handleSimulateSqueezeOut = () => {
    setDominantPercent(96.2);
    setHolders((prev) => [
      { ...prev[0], percentage: 96.2, tokensHeld: 481000 },
      { ...prev[1], percentage: 1.8, tokensHeld: 9000 },
      { ...prev[2], percentage: 1.0, tokensHeld: 5000 },
      { ...prev[3], percentage: 1.0, tokensHeld: 5000 },
    ]);
    setOpaState('SQUEEZE_OUT');
    setActionMessage('Umbral del 95% alcanzado. Declaración de Cuasi-Totalidad y Squeeze-Out habilitados conforme a Ley 26.831 Art. 91.');
    setTimeout(() => setActionMessage(null), 5000);
  };

  return (
    <div className="space-y-8 py-4">
      {/* Header */}
      <div className="space-y-2">
        <div className="inline-flex max-w-full flex-wrap items-center gap-1.5 px-3 py-1 rounded-full bg-red-950/60 border border-red-800/40 text-red-400 text-xs font-semibold uppercase tracking-wider">
          <Activity className="w-3.5 h-3.5 shrink-0" />
          Control de Concentración Ley 26.831
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-black tracking-tight">
          Monitoreo de OPA Obligatoria y Squeeze-Out
        </h1>
        <p className="text-neutral-600 text-xs sm:text-sm max-w-2xl">
          Supervisión algorítmica de la concentración de tenencias en los contratos de Soroban para proteger los derechos de los accionistas minoritarios bajo normas CNV.
        </p>
      </div>

      {/* Threshold Status Banner */}
      <div className="p-6 rounded-2xl bg-[#0c101a] border border-white/5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-white">Estado de Gobernanza: Emisión Campaña Pergamino (500,000 Tokens)</h3>
            <p className="text-xs text-gray-400">Tenedor mayoritario actual posee el <strong className="text-white font-mono">{dominantPercent}%</strong> de la emisión.</p>
          </div>

          <div className="flex items-center gap-2">
            {dominantPercent >= 95 ? (
              <span className="px-3 py-1 rounded-full bg-purple-950 text-purple-300 border border-purple-800 text-xs font-bold font-mono">
                🚨 SQUEEZE-OUT HABILITADO (&gt;95%)
              </span>
            ) : dominantPercent >= 50 ? (
              <span className="px-3 py-1 rounded-full bg-red-950 text-red-400 border border-red-800 text-xs font-bold font-mono">
                ⚠️ OPA OBLIGATORIA ACTIVA (&gt;50%)
              </span>
            ) : (
              <span className="px-3 py-1 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800 text-xs font-bold font-mono">
                ✓ DISTRIBUCIÓN NORMAL (&lt;50%)
              </span>
            )}
          </div>
        </div>

        {/* Progress Bar of Dominance */}
        <div className="space-y-1.5">
          <div className="relative w-full h-4 bg-gray-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                dominantPercent >= 95
                  ? 'bg-purple-500'
                  : dominantPercent >= 50
                  ? 'bg-gradient-to-r from-yellow-500 to-red-500'
                  : 'bg-emerald-500'
              }`}
              style={{ width: `${dominantPercent}%` }}
            />
            {/* 50% OPA line marker */}
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-red-400"
              style={{ left: '50%' }}
              title="Umbral OPA 50%"
            />
            {/* 95% Squeeze-out line marker */}
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-purple-400"
              style={{ left: '95%' }}
              title="Umbral Squeeze-Out 95%"
            />
          </div>

          <div className="grid grid-cols-2 gap-1 sm:flex sm:justify-between text-[10px] sm:text-[11px] text-gray-500 font-mono">
            <span>0%</span>
            <span className="text-red-400 font-bold">50% OPA</span>
            <span className="text-purple-400 font-bold">95% Squeeze</span>
            <span>100%</span>
          </div>
        </div>
      </div>

      {actionMessage && (
        <div className="p-3 rounded-xl bg-emerald-950/60 border border-emerald-500 text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
          <span>{actionMessage}</span>
        </div>
      )}

      {/* Holders Table & Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left: Table (8 Cols) */}
        <div className="lg:col-span-8 rounded-2xl bg-[#0c101a] border border-white/5 overflow-hidden">
          <div className="p-4 bg-[#121826] border-b border-white/5 flex flex-col gap-1 sm:flex-row sm:justify-between sm:items-center">
            <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Users className="w-4 h-4 text-emerald-400 shrink-0" />
              Distribución de Tenencias
            </span>
            <span className="text-[11px] text-gray-400 font-mono">Total: 500,000 Tokens</span>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden divide-y divide-white/5">
            {holders.map((holder, idx) => (
              <div key={idx} className={`p-4 space-y-2 ${holder.isDominant ? 'bg-red-950/10' : ''}`}>
                <div className="font-bold text-white text-xs break-words">{holder.name}</div>
                {holder.isDominant && (
                  <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-950 text-red-400 border border-red-800">
                    SUJETO OBLIGADO OPA
                  </span>
                )}
                <div className="font-mono text-[11px] text-gray-400 break-all">{holder.address}</div>
                <div className="flex justify-between text-xs font-mono">
                  <span className="text-white">{holder.tokensHeld.toLocaleString()} tokens</span>
                  <span className={holder.percentage >= 50 ? 'text-red-400 font-bold' : 'text-gray-300'}>
                    {holder.percentage.toFixed(1)}%
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-xs min-w-[36rem]">
              <thead className="text-gray-400 font-mono text-[11px] uppercase border-b border-white/5 bg-[#0e1320]">
                <tr>
                  <th className="px-4 py-3">Tenedor / Institución</th>
                  <th className="px-4 py-3">Dirección Stellar</th>
                  <th className="px-4 py-3 text-right">Tokens</th>
                  <th className="px-4 py-3 text-right">Porcentaje</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {holders.map((holder, idx) => (
                  <tr key={idx} className={holder.isDominant ? 'bg-red-950/10' : ''}>
                    <td className="px-4 py-3">
                      <div className="font-bold text-white text-xs">{holder.name}</div>
                      {holder.isDominant && (
                        <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-red-950 text-red-400 border border-red-800">
                          SUJETO OBLIGADO OPA
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-[11px] text-gray-400">
                      <span className="truncate block max-w-[140px]">{holder.address}</span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-white">
                      {holder.tokensHeld.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold">
                      <span className={holder.percentage >= 50 ? 'text-red-400' : 'text-gray-300'}>
                        {holder.percentage.toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right: Simulation Controls (4 Cols) */}
        <div className="lg:col-span-4 p-6 rounded-2xl bg-[#0c101a] border border-white/10 space-y-5">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">Acciones del Contrato Soroban</h3>

          <div className="space-y-3">
            <button
              type="button"
              onClick={handleTriggerOpa}
              className="w-full py-2.5 rounded-xl bg-red-500 hover:bg-red-400 text-black font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-md shadow-red-500/20"
            >
              <Zap className="w-3.5 h-3.5" />
              Notificar OPA Obligatoria (50%)
            </button>

            <button
              type="button"
              onClick={handleSimulateSqueezeOut}
              className="w-full py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-md shadow-purple-600/20"
            >
              <Scale className="w-3.5 h-3.5" />
              Simular Squeeze-Out (95%)
            </button>
          </div>

          <div className="p-3.5 rounded-xl bg-[#121826] border border-white/5 space-y-2 text-xs text-gray-400">
            <div className="flex items-center gap-1.5 text-white font-semibold text-xs">
              <Scale className="w-4 h-4 text-emerald-400" /> Marco Legal CNV Ley 26.831
            </div>
            <p className="text-[11px] leading-relaxed">
              <strong>Art. 86 (OPA Obligatoria):</strong> Quien pretenda alcanzar una participación de control o supere el 50% de los votos debe formular una oferta pública dirigida a todos los tenedores con precio equitativo fijado por la CNV.
            </p>
            <p className="text-[11px] leading-relaxed">
              <strong>Art. 91 (Declaración de Cuasi-Totalidad):</strong> Al alcanzar el 95%, el oferente puede exigir la venta forzosa de las acciones restantes o los minoritarios exigir su compra al precio pactado.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
