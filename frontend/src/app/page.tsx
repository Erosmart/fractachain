'use client';

import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import {
  TrendingUp,
  ShieldCheck,
  Zap,
  Layers,
  Lock,
  Landmark,
  Globe2,
  CheckCircle2,
  Sparkles,
  Droplets,
  DollarSign,
  KeyRound,
} from 'lucide-react';
import DynamicHeroText from '../components/DynamicHeroText';
import ProductsSection from '../components/ProductsSection';
import RegulationSection from '../components/RegulationSection';
import MervalLogosSection from '../components/MervalLogosSection';
import LiquidityFirstBanner from '../components/LiquidityFirstBanner';
import ContractInspectorBanner from '../components/ContractInspectorBanner';
import PartnersShowcase from '../components/PartnersShowcase';
import IssuerCtaBanner from '../components/IssuerCtaBanner';
import MoreThanRwaSection from '../components/MoreThanRwaSection';
import { useI18n } from '../context/I18nContext';

// Lemniscata de Bernoulli (infinito real, se cruza en el centro) + órbita diagonal estilo logo
const INFINITY_PATH =
  'M580,160 L578.9,173.6 L575.8,186.7 L570.7,199.2 L563.8,210.7 L555.4,220.9 L545.7,229.8 L535.1,237.1 L523.8,242.9 L512.1,247.2 L500.1,250.1 L488.2,251.6 L476.3,251.9 L464.7,251.1 L453.5,249.3 L442.6,246.7 L432.1,243.3 L422,239.3 L412.4,234.7 L403.1,229.7 L394.3,224.3 L385.8,218.6 L377.6,212.7 L369.8,206.5 L362.2,200.1 L354.8,193.6 L347.6,187 L340.6,180.3 L333.7,173.6 L326.8,166.8 L320,160 L313.2,153.2 L306.3,146.4 L299.4,139.7 L292.4,133 L285.2,126.4 L277.8,119.9 L270.2,113.5 L262.4,107.3 L254.2,101.4 L245.7,95.7 L236.9,90.3 L227.6,85.3 L218,80.7 L207.9,76.7 L197.4,73.3 L186.5,70.7 L175.3,68.9 L163.7,68.1 L151.8,68.4 L139.9,69.9 L127.9,72.8 L116.2,77.1 L104.9,82.9 L94.3,90.2 L84.6,99.1 L76.2,109.3 L69.3,120.8 L64.2,133.3 L61.1,146.4 L60,160 L61.1,173.6 L64.2,186.7 L69.3,199.2 L76.2,210.7 L84.6,220.9 L94.3,229.8 L104.9,237.1 L116.2,242.9 L127.9,247.2 L139.9,250.1 L151.8,251.6 L163.7,251.9 L175.3,251.1 L186.5,249.3 L197.4,246.7 L207.9,243.3 L218,239.3 L227.6,234.7 L236.9,229.7 L245.7,224.3 L254.2,218.6 L262.4,212.7 L270.2,206.5 L277.8,200.1 L285.2,193.6 L292.4,187 L299.4,180.3 L306.3,173.6 L313.2,166.8 L320,160 L326.8,153.2 L333.7,146.4 L340.6,139.7 L347.6,133 L354.8,126.4 L362.2,119.9 L369.8,113.5 L377.6,107.3 L385.8,101.4 L394.3,95.7 L403.1,90.3 L412.4,85.3 L422,80.7 L432.1,76.7 L442.6,73.3 L453.5,70.7 L464.7,68.9 L476.3,68.1 L488.2,68.4 L500.1,69.9 L512.1,72.8 L523.8,77.1 L535.1,82.9 L545.7,90.2 L555.4,99.1 L563.8,109.3 L570.7,120.8 L575.8,133.3 L578.9,146.4 Z';
const HERO_ORBIT = 'M 75.5 274.1 A 270 60 -25 1 0 564.7 45.9 A 270 60 -25 1 0 75.5 274.1';

export default function HomePage() {
  const { messages, t } = useI18n();

  const soonIcons: LucideIcon[] = [Landmark, Layers, Globe2];
  const badgeIcons: LucideIcon[] = [ShieldCheck, Lock, Zap, CheckCircle2];
  const stellarIcons: LucideIcon[] = [Zap, DollarSign, Globe2, ShieldCheck, KeyRound];

  return (
    <div className="space-y-10 sm:space-y-16 lg:space-y-24">
      <section className="relative mx-auto flex min-h-0 sm:min-h-[calc(100svh-5.75rem)] max-w-5xl flex-col items-center justify-start sm:justify-center py-8 sm:py-10 pb-6 sm:pb-10 text-center">
        <div aria-hidden="true" className="pointer-events-none absolute -inset-x-6 sm:-inset-x-16 lg:-inset-x-40 inset-y-0 overflow-hidden">
          <svg viewBox="0 0 640 320" preserveAspectRatio="xMidYMid meet" className="absolute inset-0 h-full w-full" fill="none">
            <defs>
              <linearGradient id="heroInfL" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#1a6fb8" />
                <stop offset="100%" stopColor="#2fa8a0" />
              </linearGradient>
              <linearGradient id="heroInfR" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#2fa8a0" />
                <stop offset="100%" stopColor="#4ea743" />
              </linearGradient>
              <linearGradient id="heroInf" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#1a6fb8" />
                <stop offset="50%" stopColor="#2fa8a0" />
                <stop offset="100%" stopColor="#4ea743" />
              </linearGradient>
              <linearGradient id="heroBand" x1="0" y1="1" x2="1" y2="0">
                <stop offset="0%" stopColor="#1a6fb8" />
                <stop offset="55%" stopColor="#2fa8a0" />
                <stop offset="100%" stopColor="#4ea743" />
              </linearGradient>
              <filter id="heroGlow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="12" />
              </filter>
            </defs>
            {/* órbita diagonal detrás (estilo logo) */}
            <g className="globe-float">
              <path d={HERO_ORBIT} stroke="url(#heroBand)" strokeWidth="12" opacity="0.1" />
              <path d={HERO_ORBIT} stroke="url(#heroBand)" strokeWidth="12" strokeLinecap="round" strokeDasharray="46 18" opacity="0.14" className="infinity-drift-rev" />
            </g>
            {/* infinito: cinta lemniscata con gradiente azul→teal→verde */}
            <g className="globe-float">
              <path d={INFINITY_PATH} stroke="#2fa8a0" strokeWidth="46" strokeLinecap="round" opacity="0.07" filter="url(#heroGlow)" />
              <path d={INFINITY_PATH} stroke="url(#heroInf)" strokeWidth="30" strokeLinecap="round" opacity="0.16" />
              <path d={INFINITY_PATH} stroke="url(#heroInf)" strokeWidth="30" strokeLinecap="round" strokeDasharray="46 18" opacity="0.24" className="infinity-drift" />
              <path d={INFINITY_PATH} stroke="#f0b429" strokeWidth="4" strokeLinecap="round" strokeDasharray="110 18 110 18" opacity="0.4" className="infinity-drift-rev" />
              <path d={INFINITY_PATH} stroke="#ffffff" strokeWidth="7" strokeLinecap="round" strokeDasharray="60 196" opacity="0.3" className="infinity-drift" />
            </g>
            {/* nodos en las puntas de los lóbulos, como el logo */}
            <circle cx="60" cy="160" r="7" fill="#1a6fb8" opacity="0.4" />
            <circle cx="42" cy="138" r="3.5" fill="#1a6fb8" opacity="0.3" />
            <circle cx="46" cy="184" r="3" fill="#1a6fb8" opacity="0.28" />
            <circle cx="580" cy="160" r="7" fill="#4ea743" opacity="0.4" />
            <circle cx="600" cy="140" r="3.5" fill="#4ea743" opacity="0.3" />
            <circle cx="604" cy="182" r="3" fill="#4ea743" opacity="0.28" />
            <circle cx="320" cy="160" r="5" fill="#2fa8a0" opacity="0.4" />
            <circle cx="452" cy="120" r="6" fill="#f0b429" opacity="0.4" />
            {/* partículas viajando por el infinito y la órbita */}
            {[-6, -3, 0].map((begin) => (
              <circle key={`g${begin}`} r="4" fill="#4ea743" opacity="0.55">
                <animateMotion dur="9s" begin={`${begin}s`} repeatCount="indefinite" path={INFINITY_PATH} />
              </circle>
            ))}
            {[-4, -9].map((begin) => (
              <circle key={`t${begin}`} r="3" fill="#2fa8a0" opacity="0.5">
                <animateMotion dur="12s" begin={`${begin}s`} repeatCount="indefinite" path={INFINITY_PATH} />
              </circle>
            ))}
            <circle r="3" fill="#f0b429" opacity="0.55">
              <animateMotion dur="14s" begin="-7s" repeatCount="indefinite" path={INFINITY_PATH} />
            </circle>
            <circle r="3.5" fill="#1d7fc4" opacity="0.5">
              <animateMotion dur="13s" begin="-4s" repeatCount="indefinite" path={HERO_ORBIT} />
            </circle>
            <circle r="3" fill="#4ea743" opacity="0.5">
              <animateMotion dur="16s" begin="-10s" repeatCount="indefinite" path={HERO_ORBIT} />
            </circle>
            {/* ambient */}
            <circle cx="92" cy="248" r="36" fill="#1d7fc4" opacity="0.06" filter="url(#heroGlow)" />
            <circle cx="556" cy="76" r="44" fill="#4ea743" opacity="0.06" filter="url(#heroGlow)" />
            <g className="globe-float">
              <circle cx="90" cy="48" r="2.4" fill="#4ea743" opacity="0.3" />
              <circle cx="556" cy="52" r="3" fill="#4ea743" opacity="0.26" />
              <circle cx="48" cy="264" r="2.8" fill="#4ea743" opacity="0.24" />
              <circle cx="592" cy="272" r="2.2" fill="#4ea743" opacity="0.3" />
              <circle cx="320" cy="26" r="2" fill="#4ea743" opacity="0.26" />
            </g>
            <circle cx="140" cy="70" r="14" stroke="#4ea743" strokeWidth="1" opacity="0.12" />
            <circle cx="505" cy="255" r="18" stroke="#4ea743" strokeWidth="1" opacity="0.1" />
            <circle cx="70" cy="200" r="9" stroke="#4ea743" strokeWidth="1" opacity="0.12" />
            <circle cx="600" cy="110" r="22" stroke="#4ea743" strokeWidth="1" opacity="0.09" strokeDasharray="3 5" />
            <path d="M40 96v10M35 101h10" stroke="#4ea743" strokeWidth="1.4" opacity="0.22" strokeLinecap="round" />
            <path d="M604 210v10M599 215h10" stroke="#4ea743" strokeWidth="1.4" opacity="0.2" strokeLinecap="round" />
            <path d="M210 286v8M206 290h8" stroke="#4ea743" strokeWidth="1.4" opacity="0.18" strokeLinecap="round" />
            <rect x="530" y="30" width="7" height="7" rx="1.5" stroke="#4ea743" strokeWidth="1" opacity="0.18" transform="rotate(18 533.5 33.5)" />
            <rect x="118" y="250" width="6" height="6" rx="1.2" stroke="#4ea743" strokeWidth="1" opacity="0.16" transform="rotate(24 121 253)" />
          </svg>
        </div>
        <div className="relative z-10 flex w-full flex-col items-center gap-4 sm:gap-5">
          <div className="inline-flex max-w-full flex-wrap items-center justify-center gap-2 px-4 py-2 rounded-full bg-white/70 border border-black/10 text-neutral-600 text-xs font-display font-bold uppercase tracking-[0.14em]">
            <Sparkles className="w-4 h-4 shrink-0" />
            <span className="text-left">{t('home.badge')}</span>
          </div>
          <DynamicHeroText />
          <p className="hero-lead text-neutral-600 mx-auto px-1 text-[0.95rem] sm:text-[1.2rem] leading-relaxed">
            <span className="block">
              {t('home.leadBefore')} <strong className="text-black font-bold">{t('home.leadStrong')}</strong>{' '}
              {t('home.leadL1End')}
            </span>
            <span className="block">
              {t('home.leadL2Pre')}
              <strong className="text-black font-semibold">{t('home.leadStrongCap')}</strong>
              {t('home.leadL2Post')}
            </span>
            <span className="block">
              {t('home.leadL3Pre')}
              <strong className="text-black font-semibold">{t('home.leadStrong90')}</strong>
            </span>
          </p>
          <div className="flex w-full flex-col sm:flex-row sm:flex-wrap lg:flex-nowrap items-stretch sm:items-center justify-center gap-2.5 pt-1 px-1">
            <Link
              href="/market"
              className="w-full sm:w-auto justify-center px-7 py-3.5 rounded-2xl bg-black text-white font-display font-bold text-[0.95rem] flex items-center gap-2"
            >
              <Layers className="w-4 h-4 shrink-0" />
              {t('home.ctaMarket')}
            </Link>
            <Link
              href="/stocks"
              className="w-full sm:w-auto justify-center px-7 py-3.5 rounded-2xl bg-white/80 border border-black/10 text-black font-display font-bold text-[0.95rem] flex items-center gap-2"
            >
              <TrendingUp className="w-4 h-4 shrink-0" />
              {t('home.ctaStocks')}
            </Link>
            <Link
              href="/orderbook"
              className="w-full sm:w-auto justify-center px-7 py-3.5 rounded-2xl bg-white/60 border border-black/10 text-black font-display font-semibold text-[0.95rem] flex items-center gap-2"
            >
              <Droplets className="w-4 h-4 shrink-0" />
              {t('home.ctaOrderbook')}
            </Link>
          </div>
        </div>
      </section>

      <MoreThanRwaSection />

      <div className="below-fold space-y-12 md:space-y-16 lg:space-y-24">
      <ProductsSection />
      <IssuerCtaBanner />
      <RegulationSection />
      <MervalLogosSection />

      <PartnersShowcase />

      <section className="space-y-5 sm:space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 text-xs font-display font-bold text-neutral-500 uppercase tracking-wider">
              <Globe2 className="w-4 h-4" />
              {messages.partners.stellar.kicker}
            </div>
            <h2 className="font-section text-2xl sm:text-3xl font-extrabold text-black">
              {messages.partners.stellar.title}
            </h2>
          </div>
          <p className="text-sm text-neutral-600 max-w-md">
            {messages.partners.stellar.body}
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {messages.partners.stellar.items.map(([title, desc], i) => {
            const Icon = stellarIcons[i];
            return (
              <div key={title} className="p-5 rounded-2xl crystal-card space-y-3">
                <Icon className="w-5 h-5 text-[#4ea743]" />
                <div className="text-sm font-display font-bold text-black">{title}</div>
                <p className="text-xs text-neutral-600 leading-relaxed">{desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      <LiquidityFirstBanner />
      <ContractInspectorBanner />

      <section className="space-y-5 sm:space-y-6">
        <h2 className="font-section text-2xl sm:text-3xl font-extrabold">{t('home.soon')}</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5">
          {messages.home.soonItems.map(([title, desc], i) => {
            const Icon = soonIcons[i];
            return (
            <div key={title} className="p-5 sm:p-6 rounded-2xl sm:rounded-3xl crystal-card space-y-3">
              <Icon className="w-5 h-5" />
              <h4 className="font-section font-extrabold">{title}</h4>
              <p className="text-sm text-neutral-600">{desc}</p>
            </div>
            );
          })}
        </div>
      </section>

      <section className="p-5 sm:p-8 rounded-2xl sm:rounded-3xl crystal-card grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6">
        {messages.home.badges.map(([title, sub], i) => {
          const Icon = badgeIcons[i];
          return (
          <div key={title} className="flex items-center gap-3 min-w-0">
            <Icon className="w-6 h-6 shrink-0" />
            <div className="min-w-0">
              <div className="text-sm font-display font-bold">{title}</div>
              <div className="text-[11px] text-neutral-500">{sub}</div>
            </div>
          </div>
          );
        })}
      </section>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 p-4 sm:p-6 rounded-2xl sm:rounded-3xl crystal-card text-left">
          {messages.home.stats.map(({ k, v, s }) => (
            <div key={k} className="space-y-1 min-w-0">
              <span className="text-[10px] sm:text-xs text-neutral-500">{k}</span>
              <div className="text-lg sm:text-2xl font-display font-extrabold font-lcd text-black break-words">{v}</div>
              <span className="text-[10px] sm:text-[11px] text-neutral-500">{s}</span>
            </div>
          ))}
      </div>
      </div>
    </div>
  );
}
