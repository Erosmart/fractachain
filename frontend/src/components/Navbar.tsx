'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Coins,
  TrendingUp,
  Layers,
  Sprout,
  FileText,
  UserCheck,
  Building2,
  Menu,
  X,
  Wallet,
  Activity,
  LogOut,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import BrandMark from './BrandMark';
import WalletAddress from './WalletAddress';
import { formatAmount } from '../lib/format';

const primaryLinks = [
  { href: '/market', label: 'Licitaciones', icon: Layers },
  { href: '/stocks', label: 'Merval', icon: TrendingUp },
  { href: '/orderbook', label: 'Orderbook', icon: Coins },
  { href: '/forwards', label: 'Forwards', icon: Sprout },
  { href: '/warrants', label: 'Warrants', icon: FileText },
  { href: '/dashboard', label: 'Portfolio', icon: Building2 },
];

const adminLinks = [
  { href: '/admin/issuance', label: 'Emisión', icon: Coins },
  { href: '/admin/kyc', label: 'KYC', icon: UserCheck },
  { href: '/admin/testnet', label: 'Testnet', icon: Activity },
];

export default function Navbar() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { user, logout } = useAuth();
  const allLinks = user?.isAdmin ? [...primaryLinks, ...adminLinks] : primaryLinks;

  const closeMenu = () => setMobileMenuOpen(false);

  return (
    <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-black/8">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex items-center gap-2 sm:gap-4 lg:gap-6 h-[3.75rem] sm:h-[4.25rem]">
          <BrandMark />

          <div className="hidden lg:flex items-center gap-1 flex-1 min-w-0">
            {allLinks.map((link) => {
              const isActive = pathname === link.href || pathname.startsWith(`${link.href}/`);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`px-3 py-2 rounded-lg text-[13px] font-display font-bold tracking-tight whitespace-nowrap transition-colors ${
                    isActive ? 'text-black bg-black/[0.05]' : 'text-neutral-500 hover:text-black hover:bg-black/[0.03]'
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </div>

          <div className="hidden sm:flex items-center gap-2 ml-auto shrink-0">
            <span className="hidden xl:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-display font-bold uppercase tracking-wider text-neutral-500 border border-black/10">
              <span className="w-1.5 h-1.5 rounded-full bg-[#4ea743]" />
              Testnet
            </span>
            {user?.publicKey && (
              <div className="hidden xl:flex items-center px-2.5 py-1.5 rounded-xl border border-black/10 bg-white/70 max-w-[16rem]">
                <WalletAddress address={user.publicKey} compact />
              </div>
            )}
            <Link
              href="/wallet"
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-black/10 bg-white/70 text-black text-xs font-display font-bold"
            >
              <Wallet className="w-3.5 h-3.5" />
              {user?.publicKey
                ? `${formatAmount(Number(user.xlmBalance || 0), 2)} XLM`
                : 'Wallet'}
            </Link>
            {user ? (
              <div className="flex items-center gap-2 pl-2 border-l border-black/10">
                <Link href="/dashboard" className="text-xs font-display font-bold text-black max-w-[9rem] truncate">
                  {user.name}
                </Link>
                <button type="button" onClick={logout} className="p-1.5 rounded-lg text-neutral-500 hover:text-black" aria-label="Salir">
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <Link
                href="/login"
                className="px-3.5 py-1.5 rounded-xl bg-black text-white text-xs font-display font-bold"
              >
                Ingresar
              </Link>
            )}
          </div>

          <div className="flex items-center gap-1 ml-auto sm:ml-0 lg:hidden">
            <Link
              href="/wallet"
              className="sm:hidden p-2 rounded-lg text-black"
              aria-label="Wallet"
            >
              <Wallet className="w-5 h-5" />
            </Link>
            <button
              type="button"
              className="p-2 text-black"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label={mobileMenuOpen ? 'Cerrar menú' : 'Abrir menú'}
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {mobileMenuOpen && (
        <div className="lg:hidden border-t border-black/10 px-3 sm:px-4 pt-2 pb-4 space-y-1 bg-white/95 max-h-[min(80vh,32rem)] overflow-y-auto">
          {user?.publicKey && (
            <div className="px-3 py-2">
              <p className="text-[10px] uppercase text-neutral-500 mb-1">Tu wallet</p>
              <WalletAddress address={user.publicKey} compact />
            </div>
          )}
          {allLinks.map((link) => {
            const Icon = link.icon;
            const isActive = pathname === link.href || pathname.startsWith(`${link.href}/`);
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={closeMenu}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-display font-bold ${
                  isActive ? 'bg-black text-white' : 'text-neutral-700 hover:bg-black/5'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {link.label}
              </Link>
            );
          })}

          <div className="pt-2 mt-2 border-t border-black/10 space-y-1 sm:hidden">
            <Link
              href="/wallet"
              onClick={closeMenu}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-display font-bold text-neutral-700 hover:bg-black/5"
            >
              <Wallet className="w-4 h-4 shrink-0" />
              {user?.publicKey
                ? `${formatAmount(Number(user.xlmBalance || 0), 2)} XLM`
                : 'Wallet'}
            </Link>
            {user ? (
              <>
                <Link
                  href="/dashboard"
                  onClick={closeMenu}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-display font-bold text-neutral-700 hover:bg-black/5 truncate"
                >
                  {user.name}
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    logout();
                    closeMenu();
                  }}
                  className="flex w-full items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-display font-bold text-neutral-700 hover:bg-black/5"
                >
                  <LogOut className="w-4 h-4 shrink-0" />
                  Salir
                </button>
              </>
            ) : (
              <Link
                href="/login"
                onClick={closeMenu}
                className="flex items-center justify-center gap-2 mx-3 mt-1 px-3 py-2.5 rounded-xl bg-black text-white text-sm font-display font-bold"
              >
                Ingresar
              </Link>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
