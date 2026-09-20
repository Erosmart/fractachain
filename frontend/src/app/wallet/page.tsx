'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  Wallet,
  Shield,
  Key,
  Copy,
  Check,
  Eye,
  EyeOff,
  AlertCircle,
  RefreshCw,
  ArrowRight,
  Lock,
  Mail,
  Zap,
  CheckCircle2,
  ExternalLink,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import GoogleLoginButton from '../../components/GoogleLoginButton';

const MOCK_MNEMONIC = [
  'stellar', 'horizon', 'soroban', 'pampeana',
  'cosecha', 'warrant', 'merval', 'custody',
  'protocol', 'argentina', 'fractal', 'yield'
];

export default function WalletPage() {
  const { user } = useAuth();
  const [custodyMode, setCustodyMode] = useState<'MANAGED' | 'SELF_CUSTODY'>('SELF_CUSTODY');
  const [showSeed, setShowSeed] = useState(false);
  const [copied, setCopied] = useState(false);
  
  // Verification Quiz
  const [quizWord3, setQuizWord3] = useState('');
  const [quizWord9, setQuizWord9] = useState('');
  const [quizPassed, setQuizPassed] = useState(false);
  const [quizError, setQuizError] = useState(false);

  // Managed email state
  const [email, setEmail] = useState('inversor@fractachain.com');
  const [managedSaved, setManagedSaved] = useState(false);

  const handleCopySeed = () => {
    navigator.clipboard.writeText(MOCK_MNEMONIC.join(' '));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleVerifyQuiz = () => {
    if (quizWord3.trim().toLowerCase() === MOCK_MNEMONIC[2] && quizWord9.trim().toLowerCase() === MOCK_MNEMONIC[8]) {
      setQuizPassed(true);
      setQuizError(false);
    } else {
      setQuizError(true);
    }
  };

  return (
    <div className="max-w-4xl mx-auto py-6 space-y-8">
      {/* Header */}
      <div className="text-center space-y-2 px-1">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-950/60 border border-cyan-800/40 text-cyan-400 text-xs font-semibold uppercase tracking-wider">
          <Wallet className="w-3.5 h-3.5" />
          Infraestructura Dual de Billeteras
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-black tracking-tight">
          Gestión de Custodia y Billetera
        </h1>
        <p className="text-neutral-600 text-xs sm:text-sm max-w-lg mx-auto">
          Elige entre la simplicidad de la custodia institucional Web2 segregada o el control absoluto de tus llaves en auto-custodia Web3 BIP-39.
        </p>
      </div>

      {/* Custody Switcher */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Option 1: Managed Web2 */}
        <div
          onClick={() => setCustodyMode('MANAGED')}
          className={`p-6 rounded-2xl border cursor-pointer transition-all space-y-3 ${
            custodyMode === 'MANAGED'
              ? 'bg-[#101726] border-emerald-500 shadow-lg shadow-emerald-500/10'
              : 'bg-[#0c101a] border-white/5 hover:border-gray-700 opacity-75'
          }`}
        >
          <div className="flex justify-between items-start">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Mail className="w-5 h-5" />
            </div>
            {custodyMode === 'MANAGED' && (
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500 text-black">
                ACTIVO
              </span>
            )}
          </div>
          <div>
            <h3 className="text-base font-bold text-white">Modo Fintech (Custodia Segregada)</h3>
            <p className="text-xs text-gray-400 mt-1">
              Diseñado para productores e inversores tradicionales. Acceso con email y 2FA, claves administradas bajo MPC institucional.
            </p>
          </div>
          <div className="text-[11px] text-emerald-400/90 flex items-center gap-1 font-medium">
            <CheckCircle2 className="w-3.5 h-3.5" /> Sin gestión de frases semilla
          </div>
        </div>

        {/* Option 2: Self Custody Web3 */}
        <div
          onClick={() => setCustodyMode('SELF_CUSTODY')}
          className={`p-6 rounded-2xl border cursor-pointer transition-all space-y-3 ${
            custodyMode === 'SELF_CUSTODY'
              ? 'bg-[#101726] border-cyan-500 shadow-lg shadow-cyan-500/10'
              : 'bg-[#0c101a] border-white/5 hover:border-gray-700 opacity-75'
          }`}
        >
          <div className="flex justify-between items-start">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <Key className="w-5 h-5" />
            </div>
            {custodyMode === 'SELF_CUSTODY' && (
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-400 text-black">
                ACTIVO
              </span>
            )}
          </div>
          <div>
            <h3 className="text-base font-bold text-white">Modo Web3 (Auto-Custodia)</h3>
            <p className="text-xs text-gray-400 mt-1">
              Tus llaves, tus activos. Frase mnemónica de 12 palabras BIP-39, compatible con Freighter, xBull y Ledger Hardware Wallets.
            </p>
          </div>
          <div className="text-[11px] text-cyan-400/90 flex items-center gap-1 font-medium">
            <CheckCircle2 className="w-3.5 h-3.5" /> Soberanía total on-chain
          </div>
        </div>
      </div>

      {/* Mode Details Section */}
      {custodyMode === 'MANAGED' ? (
        <div className="p-6 sm:p-8 rounded-2xl bg-[#0c101a] border border-white/5 space-y-6">
          <div className="space-y-1">
            <h3 className="text-lg font-bold text-white">Configuración de Custodia Gestionada</h3>
            <p className="text-xs text-gray-400">
              Tus órdenes de compra y dividendos se procesarán automáticamente a través de la cuenta comitente vinculada a tu correo verificado.
            </p>
          </div>

          <div className="space-y-4 max-w-md">
            {user ? (
              <div className="p-3.5 rounded-xl bg-emerald-950/40 border border-emerald-500/40 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between text-xs">
                <div className="flex items-center gap-2.5 min-w-0">
                  <img src={user.avatar} alt={user.name} className="w-8 h-8 rounded-full border border-emerald-400 shrink-0" />
                  <div className="min-w-0">
                    <span className="font-bold text-white block truncate">{user.name}</span>
                    <span className="text-emerald-300 text-[11px] font-mono break-all">{user.email}</span>
                  </div>
                </div>
                <span className="self-start sm:self-auto px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-900 text-emerald-300 border border-emerald-700 shrink-0">
                  VINCULADA
                </span>
              </div>
            ) : (
              <div className="space-y-2">
                <GoogleLoginButton label="Iniciar sesión con Google para Custodia Web2" variant="light" className="w-full" />
                <p className="text-[10px] text-gray-400 text-center">O ingresa un correo electrónico alternativo:</p>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs text-gray-300 font-medium">Correo Electrónico Registrado</label>
              <input
                type="email"
                value={user?.email || email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-[#121826] border border-gray-700/60 focus:border-emerald-500 focus:outline-none text-xs text-white font-sans"
              />
            </div>

            <div className="p-4 rounded-xl bg-[#121826] border border-white/5 space-y-2 text-xs text-gray-300">
              <div className="flex items-center gap-2 text-emerald-400 font-semibold">
                <Shield className="w-4 h-4" /> Bóveda Comitente Segregada
              </div>
              <p className="text-[11px] text-gray-400 leading-relaxed">
                Tus activos no forman parte del balance de Fractachain; se custodian en subcuentas nominadas de Caja de Valores S.A. conforme a la Ley 26.831.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setManagedSaved(true)}
              className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs flex items-center gap-2 transition-all shadow-md shadow-emerald-500/20"
            >
              {managedSaved ? '✓ Configuración Guardada' : 'Guardar y Vincular Cuenta'}
            </button>
          </div>
        </div>
      ) : (
        <div className="p-6 sm:p-8 rounded-2xl bg-[#0c101a] border border-white/5 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-lg font-bold text-white">Billetera de Prueba (Stellar Testnet)</h3>
              <p className="text-xs text-gray-400">Identidad criptográfica activa en el entorno de desarrollo</p>
            </div>
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-mono bg-cyan-950/60 text-cyan-300 border border-cyan-800/60">
              Protocol 22 (Soroban Enabled)
            </span>
          </div>

          {/* Wallet Address & Balances */}
          <div className="p-4 rounded-xl bg-[#121826] border border-white/5 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <span className="text-xs text-gray-400">Clave Pública (Public Key):</span>
              <span className="font-mono text-xs text-emerald-400 break-all select-all">
                {user?.publicKey || 'Iniciá sesión para ver tu dirección'}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-white/5">
              <div className="p-2.5 rounded-lg bg-[#0a0d16] border border-white/5 min-w-0">
                <span className="text-[10px] text-gray-400 block">Balance XLM</span>
                <span className="text-xs sm:text-sm font-bold font-mono text-white break-all">10,000.00 XLM</span>
              </div>
              <div className="p-2.5 rounded-lg bg-[#0a0d16] border border-white/5 min-w-0">
                <span className="text-[10px] text-gray-400 block">Balance USDC</span>
                <span className="text-xs sm:text-sm font-bold font-mono text-emerald-400 break-all">12,500.00 USDC</span>
              </div>
              <div className="p-2.5 rounded-lg bg-[#0a0d16] border border-white/5 min-w-0">
                <span className="text-[10px] text-gray-400 block">Acciones tYPF</span>
                <span className="text-xs sm:text-sm font-bold font-mono text-cyan-400">50 TOKENS</span>
              </div>
              <div className="p-2.5 rounded-lg bg-[#0a0d16] border border-white/5 min-w-0">
                <span className="text-[10px] text-gray-400 block">Estado KYC</span>
                <span className="text-xs sm:text-sm font-bold text-emerald-400">WHITELISTED</span>
              </div>
            </div>
          </div>

          {/* 12 Words BIP-39 Seed Container */}
          <div className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <label className="text-xs font-semibold text-gray-200 flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                Frase Mnemónica de Recuperación (BIP-39)
              </label>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowSeed(!showSeed)}
                  className="px-2.5 py-1 rounded-lg bg-[#141b2c] hover:bg-[#1a2338] text-[11px] text-gray-300 flex items-center gap-1 transition-colors"
                >
                  {showSeed ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                  {showSeed ? 'Ocultar' : 'Revelar'}
                </button>
                <button
                  type="button"
                  onClick={handleCopySeed}
                  className="px-2.5 py-1 rounded-lg bg-[#141b2c] hover:bg-[#1a2338] text-[11px] text-cyan-300 flex items-center gap-1 transition-colors"
                >
                  {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  {copied ? 'Copiado' : 'Copiar Frase'}
                </button>
              </div>
            </div>

            {/* Words Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 sm:gap-2.5 p-3 sm:p-4 rounded-xl bg-[#090d16] border border-white/5">
              {MOCK_MNEMONIC.map((word, idx) => (
                <div
                  key={idx}
                  className="p-2 rounded-lg bg-[#121826] border border-white/5 flex items-center gap-2 text-xs font-mono"
                >
                  <span className="text-gray-400 select-none text-[10px] w-4">{idx + 1}.</span>
                  <span className={`font-semibold ${showSeed ? 'text-white' : 'blur-sm select-none text-gray-500'}`}>
                    {showSeed ? word : '••••••••'}
                  </span>
                </div>
              ))}
            </div>

            {/* Security Notice */}
            <div className="p-3 rounded-xl bg-amber-950/20 border border-amber-800/40 text-amber-300 text-[11px] flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
              <div>
                <strong>Aviso Crítico de Seguridad:</strong> Nunca compartas estas palabras con nadie. El equipo de Fractachain jamás te pedirá tu frase de recuperación. Anótalas en papel y guárdalas en un lugar seguro.
              </div>
            </div>
          </div>

          {/* Seed Verification Challenge */}
          <div className="p-4 rounded-xl bg-[#121826] border border-white/5 space-y-3">
            <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-emerald-400" />
              Desafío de Confirmación de Respaldo
            </h4>
            <p className="text-[11px] text-gray-400">
              Para garantizar que has respaldado tu frase, ingresa las palabras correspondientes:
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[11px] text-gray-400 font-mono">Palabra #3:</label>
                <input
                  type="text"
                  placeholder="Escribe la palabra #3"
                  value={quizWord3}
                  onChange={(e) => setQuizWord3(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg bg-[#0a0d16] border border-gray-700 text-xs text-white font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] text-gray-400 font-mono">Palabra #9:</label>
                <input
                  type="text"
                  placeholder="Escribe la palabra #9"
                  value={quizWord9}
                  onChange={(e) => setQuizWord9(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-lg bg-[#0a0d16] border border-gray-700 text-xs text-white font-mono"
                />
              </div>
            </div>

            {quizError && (
              <p className="text-[11px] text-red-400">
                Las palabras no coinciden. Revisa la frase de 12 palabras y vuelve a intentarlo.
              </p>
            )}

            {quizPassed ? (
              <div className="p-2.5 rounded-lg bg-emerald-950/40 border border-emerald-800/60 text-emerald-300 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                ¡Respaldo verificado exitosamente! Tu billetera está lista para operar.
              </div>
            ) : (
              <button
                type="button"
                onClick={handleVerifyQuiz}
                className="px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-black font-semibold text-xs transition-all"
              >
                Verificar Respaldo
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
