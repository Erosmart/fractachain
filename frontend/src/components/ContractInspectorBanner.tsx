'use client';

import React, { useState } from 'react';
import { Terminal, Shield, Code, CheckCircle2, Copy, ExternalLink, Cpu } from 'lucide-react';

interface ContractData {
  id: string;
  name: string;
  wasmFile: string;
  wasmHash: string;
  sizeBytes: number;
  framework: string;
  functions: string[];
  description: string;
}

const CONTRACTS: ContractData[] = [
  {
    id: 'licitacion',
    name: 'fractachain_licitacion',
    wasmFile: 'fractachain_licitacion.wasm',
    wasmHash: '7df09b6532b1e148d4c537ff93e4c8e0c7c9067524b280f6a8c2f2b68db35657',
    sizeBytes: 14693,
    framework: 'CNV RG 1150 / Ley 26.831 (OPA 50% & Squeeze-Out 95%)',
    functions: [
      'initialize(admin, fiduciary, payment_token, soft_cap, hard_cap, deadline, price, legal_info)',
      'set_fiduciary(admin, company_wallet) [antes del primer aporte]',
      'set_payment_token(admin, payment_token) [XLM/USDC/USDT SAC, before first contribution]',
      'set_price_per_unit(admin, price) [before first contribution]',
      'verify_investor(admin, investor, country_code, investor_type, expiry) [horario 08-16 ART solo en mainnet]',
      'revoke_investor(admin, investor)',
      'is_verified(investor) -> bool',
      'contribute(buyer, payment_amount) [solo KYC aprobado]',
      'finalize() [paga la wallet de la empresa al alcanzar soft cap]',
      'withdraw_proceeds(admin) [reintento si el pago se interrumpió]',
      'refund(contributor) [Failed issuance burns RWA]',
      'launch_opa(acquirer, price_per_share)',
      'accept_opa(seller) [pagado desde escrow]',
      'execute_squeeze_out(acquirer, buyout_price) [95% + precio equitativo]',
      'claim_squeeze_out(holder)',
    ],
    description: 'Emisión primaria de acciones tokenizadas. Solo inversores con KYC suscriben. Al cerrar con éxito el USDC va a la wallet de la empresa. El secundario cotiza en el DEX nativo de Stellar (AUTH_REQUIRED), no en un libro propio.',
  },
  {
    id: 'forward',
    name: 'forward_contract',
    wasmFile: 'forward_contract.wasm',
    wasmHash: 'd25486b32c82d333e1c95440388215eff5ce9c5f415abc75f51631e65a004b75',
    sizeBytes: 5439,
    framework: 'Art. 1131 Código Civil y Comercial de la Nación (CCyC)',
    functions: [
      'initialize(producer, buyer, payment_token, crop_name, total_kilos, price_per_kilo, harvest_deadline) [buyer+producer auth]',
      'pre_cancel(caller) [20% penalty to producer]',
      'mark_delivered(producer)',
      'accept_delivery(buyer) [releases escrow]',
      'refund_on_non_delivery(buyer) [after deadline+15d]',
      'execute_rollover_in_kind() [+10% kilos, stays Active]',
      'transfer_position(current_buyer, new_buyer, transfer_price) [both auth]',
    ],
    description: 'Contratos Forwards agropecuarios a término con penalidad pactada de rescisión del 20% a favor del productor o compensación por rollover en especie (+10%).',
  },
  {
    id: 'warrant',
    name: 'warrant_vault',
    wasmFile: 'warrant_vault.wasm',
    wasmHash: 'e0bde4af7839edc3edb7590deeff82580f6dd43a39ae7ab717b7a75468654b03',
    sizeBytes: 4412,
    framework: 'Ley Nacional de Warrants N° 9643 / Oráculo Satelital PoGR',
    functions: [
      'initialize(producer, oracle, payment_token, pogr_hash, inventory_value, ltv_bps, interest_bps, duration_days)',
      'fund_loan(lender) [XLM/USDC/USDT burst to producer]',
      'repay_loan(payer) [prorated interest to lender]',
      'execute_liquidation() [collateral holder = lender]',
      'get_status() -> WarrantStatus',
    ],
    description: 'Burst Loans de liquidez inmediata para productores vitivinícolas y de granos con 50-60% LTV, garantizados por certificados de depósito y Proof-of-Grain-Reserve.',
  },
  {
    id: 'stock',
    name: 'stock_vault',
    wasmFile: 'stock_vault.wasm',
    wasmHash: '3a24bd73ca4bcf6799127fa1e4b3425a35138d0f62917a66e05305df32f2cbd5',
    sizeBytes: 9144,
    framework: 'Custodia Comitente 1:1 Caja de Valores S.A. (Subcuenta 84920)',
    functions: [
      'initialize_stock(admin, payment_token, ticker, company_name, isin, custodian_cuit)',
      'set_payment_token(admin, payment_token) [before first mint]',
      'mint_backed_stock(admin, to, amount, cv_deposit_hash)',
      'burn_for_redemption(caller, amount, external_broker_comitente)',
      'deposit_dividends(admin, total_payment) [pinned XLM/USDC/USDT]',
      'claim_dividends(investor) -> i128',
      'update_proof_of_reserve(admin, shares_in_cv, audit_hash)',
    ],
    description: 'Emisión tokenizada de acciones del Merval (tYPF, tGGAL, tPAMP) respaldadas 1:1 en Caja de Valores con distribución automatizada de dividendos en el token de pago pinneado.',
  },
  {
    id: 'factory',
    name: 'issuance_factory',
    wasmFile: 'issuance_factory.wasm',
    wasmHash: 'pending-rebuild',
    sizeBytes: 0,
    framework: 'Admin registry · XLM / USDC / USDT allowlist',
    functions: [
      'initialize(admin)',
      'set_payment_asset(admin, kind, token) [Xlm | Usdc | Usdt]',
      'register_product(admin, kind, contract, payment_kind, price, name) -> u64',
      'set_product_price(admin, product_id, price) [registry; also call child set_price_per_unit]',
      'get_product(id) / get_product_count()',
    ],
    description: 'Registro de emisiones. El admin configura SAC de pago y da de alta cada licitación, forward, warrant o stock desplegado.',
  },
];

export default function ContractInspectorBanner() {
  const [selectedId, setSelectedId] = useState<string>('licitacion');
  const [copied, setCopied] = useState<boolean>(false);

  const current = CONTRACTS.find((c) => c.id === selectedId) || CONTRACTS[0];

  const handleCopyHash = () => {
    navigator.clipboard.writeText(current.wasmHash);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section className="rounded-2xl sm:rounded-3xl crystal-card p-4 sm:p-6 lg:p-10 relative overflow-hidden space-y-5 sm:space-y-6">
      <div className="absolute top-0 right-0 w-80 h-80 bg-leaf-200 rounded-full blur-3xl opacity-50 pointer-events-none" />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1 min-w-0">
          <div className="inline-flex items-center gap-2 text-xs font-lcd text-neutral-500 font-bold uppercase tracking-wider">
            <Cpu className="w-4 h-4" />
            WASM · Protocolo 27
          </div>
          <h2 className="font-section text-xl sm:text-2xl font-extrabold text-black">
            Contratos on-chain
          </h2>
          <p className="text-sm text-neutral-600 max-w-xl">
            Interfaz pública de cada wasm. Hashes reproducibles.
          </p>
        </div>

        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-black/10 bg-white/80 text-black text-xs font-lcd shrink-0">
          SDK 27.0.6
        </div>
      </div>

      <div className="flex flex-wrap gap-2 pt-2 border-b border-black/10 pb-4">
        {CONTRACTS.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setSelectedId(c.id)}
            className={`max-w-full px-3 sm:px-4 py-2 rounded-xl text-xs font-section font-bold flex items-center gap-2 border ${
              selectedId === c.id ? 'bg-black text-white border-black' : 'bg-white/70 border-black/10 text-neutral-600'
            }`}
          >
            <Code className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{c.name}</span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 sm:gap-6 items-start">
        <div className="lg:col-span-5 space-y-4">
          <div className="p-4 rounded-2xl border border-black/10 bg-white/75 space-y-3 text-xs">
            <div>
              <span className="text-neutral-500 block text-[10px] uppercase font-lcd">Marco</span>
              <span className="text-black font-bold block break-words">{current.framework}</span>
            </div>
            <div>
              <span className="text-neutral-500 block text-[10px] uppercase font-lcd">Para qué</span>
              <span className="text-neutral-700 block leading-relaxed">{current.description}</span>
            </div>
            <div className="pt-2 border-t border-black/10 grid grid-cols-2 gap-2 text-[11px] font-lcd">
              <div>
                <span className="text-neutral-500 block">WASM</span>
                <span className="text-black font-bold">{(current.sizeBytes / 1024).toFixed(1)} KB</span>
              </div>
              <div>
                <span className="text-neutral-500 block">Métodos</span>
                <span className="text-black font-bold">{current.functions.length}</span>
              </div>
            </div>
          </div>
          <div className="p-4 rounded-2xl border border-black/10 bg-white/75 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] uppercase font-lcd text-neutral-500">SHA-256</span>
              <button type="button" onClick={handleCopyHash} className="text-[11px] font-lcd text-black flex items-center gap-1 shrink-0">
                {copied ? <><CheckCircle2 className="w-3 h-3" /> Copiado</> : <><Copy className="w-3 h-3" /> Copiar</>}
              </button>
            </div>
            <code className="block text-[10px] font-lcd text-neutral-700 break-all bg-white p-2 rounded-lg border border-black/10">
              {current.wasmHash}
            </code>
          </div>
        </div>

        <div className="lg:col-span-7 rounded-2xl border border-black/10 bg-white/80 overflow-hidden font-lcd text-xs">
          <div className="px-4 py-2.5 border-b border-black/10 flex items-center justify-between">
            <div className="flex items-center gap-2 text-neutral-600 text-[11px]">
              <Terminal className="w-3.5 h-3.5" />
              spec pública
            </div>
          </div>
          <div className="p-4 max-h-[260px] overflow-y-auto space-y-2 text-[11px] leading-relaxed text-neutral-700">
            {current.functions.map((fn, i) => (
              <div key={i} className="flex items-start gap-2 min-w-0">
                <span className="text-neutral-400 select-none shrink-0">{i + 1}.</span>
                <span className="font-bold text-black shrink-0">fn</span>
                <span className="break-all min-w-0">{fn}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
