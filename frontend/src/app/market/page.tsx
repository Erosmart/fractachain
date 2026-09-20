'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { API_BASE_URL } from '../../lib/api';
import { MOCK_POOLS, Pool } from '../../lib/mock-data';

export default function MarketPage() {
  const [pools, setPools] = useState<(Pool & { validation?: any; tokenTicker?: string })[]>(MOCK_POOLS);

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/market/pools`)
      .then((r) => r.json())
      .then((json) => {
        if (Array.isArray(json?.data) && json.data.length) {
          setPools(json.data);
        }
      })
      .catch(() => {});
  }, []);

  return (
    <div className="space-y-8 py-6">
      <div>
        <p className="font-lcd text-[11px] uppercase tracking-[0.2em] text-neutral-500">Mercado primario</p>
          <h1 className="text-2xl sm:text-3xl font-extrabold font-display">Licitaciones</h1>
        <p className="text-neutral-600 max-w-xl mt-1">
          {pools.filter((p) => p.status === 'OPEN').length} licitacion{pools.filter((p) => p.status === 'OPEN').length === 1 ? '' : 'es'} abierta{pools.filter((p) => p.status === 'OPEN').length === 1 ? '' : 's'}. Expediente: CUIT, ISIN, CNV, Caja de Valores y contratos.
        </p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {pools.map((pool) => {
          const progress = Math.min(100, Math.round((pool.raisedAmount / pool.hardCap) * 100));
          return (
            <article key={pool.id} className="p-6 rounded-3xl crystal-card space-y-4 flex flex-col">
              <div className="flex justify-between gap-2">
                <span className="text-xs font-lcd text-[#3f8f38]">{pool.tna}% TNA USD</span>
                <span className="text-[10px] uppercase text-neutral-500">{pool.status}</span>
              </div>
              <h2 className="font-section text-xl font-extrabold leading-tight">{pool.title}</h2>
              <p className="text-sm text-neutral-600">{pool.producerName}</p>
              {(pool as any).tokenTicker && (
                <p className="text-xs font-mono">Token {(pool as any).tokenTicker} · ISIN {(pool as any).isin}</p>
              )}
              <div className="h-2 rounded-full bg-black/5 overflow-hidden">
                <div className="h-full bg-black" style={{ width: `${progress}%` }} />
              </div>
              <p className="text-xs text-neutral-500">
                ${pool.raisedAmount.toLocaleString()} / ${pool.hardCap.toLocaleString()} USDC
                {pool.minInvestment ? ` · mín. $${pool.minInvestment.toLocaleString()}` : ''}
              </p>
              {(pool as any).validation?.checks && (
                <ul className="text-xs space-y-1">
                  {(pool as any).validation.checks.map((c: any) => (
                    <li key={c.key} className={c.ok ? 'text-[#2f6f28]' : 'text-neutral-400'}>
                      {c.ok ? '✓' : '○'} {c.label}
                    </li>
                  ))}
                </ul>
              )}
              <Link href={`/market/${pool.id}`} className="inline-flex items-center gap-2 text-sm font-display font-bold pt-2">
                Ver ficha de validación <ArrowRight className="w-4 h-4" />
              </Link>
            </article>
          );
        })}
      </div>
    </div>
  );
}
