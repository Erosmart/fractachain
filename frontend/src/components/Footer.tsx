'use client';

import React from 'react';
import Link from 'next/link';
import { Lock } from 'lucide-react';
import BrandMark from './BrandMark';
import { useAuth } from '../context/AuthContext';

export default function Footer() {
  const { user } = useAuth();
  return (
    <footer className="relative z-10 border-t border-black/10 pt-8 sm:pt-14 pb-8 sm:pb-10 text-neutral-600 text-sm">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-10 mb-8 sm:mb-10">
          <div className="space-y-4">
            <BrandMark />
            <p className="text-neutral-600 text-sm leading-relaxed max-w-sm">
              RWA argentino y Merval tokenizado sobre <strong className="text-black">Stellar</strong>.
            </p>
          </div>
          <div>
            <h4 className="font-display font-extrabold text-black text-xs tracking-wider uppercase mb-3">Mercados</h4>
            <ul className="space-y-2 text-sm">
              <li><Link href="/market" className="hover:text-black">Licitaciones</Link></li>
              <li><Link href="/stocks" className="hover:text-black">Acciones Merval</Link></li>
              <li><Link href="/forwards" className="hover:text-black">Forwards</Link></li>
              <li><Link href="/warrants" className="hover:text-black">Warrants</Link></li>
            </ul>
          </div>
          {user?.isAdmin && (
          <div>
            <h4 className="font-display font-extrabold text-black text-xs tracking-wider uppercase mb-3">Admin</h4>
            <ul className="space-y-2 text-sm">
              <li><Link href="/admin/issuance" className="hover:text-black">Emisión</Link></li>
              <li><Link href="/admin/kyc" className="hover:text-black">KYC</Link></li>
            </ul>
          </div>
          )}
        </div>
        <div className="p-4 rounded-2xl crystal-card mb-8">
          <div className="flex items-center gap-2 text-black font-display font-bold text-xs uppercase tracking-wider">
            <Lock className="w-4 h-4" /> Aviso
          </div>
          <p className="text-[11px] leading-relaxed text-neutral-600 mt-2">
            Sandbox CNV RG 1150/2026. Tokens de acciones 1:1 en Caja de Valores. Forwards y warrants: Art. 1131 CCyC y Ley 9643.
          </p>
        </div>
        <div className="flex justify-between text-xs text-neutral-500 font-lcd">
          <p suppressHydrationWarning>© {new Date().getFullYear()} Fractachain</p>
          <p>TESTNET</p>
        </div>
      </div>
    </footer>
  );
}
