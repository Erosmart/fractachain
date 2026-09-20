'use client';

import React, { useState, useEffect } from 'react';

const SECTORS = [
  { text: 'en tabaco', tag: 'Valles de Salta & Jujuy', yieldEst: '16.8% TNA USD' },
  { text: 'en vinos', tag: 'Valles Calchaquíes & Cuyo', yieldEst: '15.2% TNA USD' },
  { text: 'en soja', tag: 'Zona Núcleo Pampeana', yieldEst: '14.0% TNA USD' },
  { text: 'en maíz', tag: 'Región Centro', yieldEst: '13.8% TNA USD' },
  { text: 'en trigo', tag: 'Región Sur', yieldEst: '13.5% TNA USD' },
  { text: 'en acopios de trigo', tag: 'Warrants Ley 9643', yieldEst: '14.1% TNA USD' },
  { text: 'en YPF', tag: 'tYPF · Caja de Valores 1:1', yieldEst: 'DIVID. USD' },
  { text: 'en el futuro', tag: 'Forwards y campaña', yieldEst: 'T+0' },
  { text: 'global', tag: 'Stellar · USDC · Merval', yieldEst: '24/7' },
];

export default function DynamicHeroText() {
  const [index, setIndex] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setIsAnimating(true);
      setTimeout(() => {
        setIndex((prev) => (prev + 1) % SECTORS.length);
        setIsAnimating(false);
      }, 400);
    }, 4500);
    return () => clearInterval(timer);
  }, []);

  const current = SECTORS[index];

  return (
    <div className="flex flex-col items-center justify-center gap-3 w-full px-1">
      <h1 className="text-[1.85rem] sm:text-5xl xl:text-[3.35rem] font-extrabold tracking-tight text-black leading-[1.15] text-center max-w-full">
        <span className="font-display">Invertí </span>
        <span className="inline-block relative min-h-[1.2em] min-w-0 sm:min-w-[12ch] md:min-w-[18ch] align-baseline max-w-full">
          <span
            className={`hero-lcd inline-block text-[1.02em] sm:text-[1.04em] transition-all duration-500 ease-out break-words ${
              isAnimating ? 'opacity-0 translate-y-5' : 'opacity-100 translate-y-0'
            }`}
          >
            {current.text}
          </span>
        </span>
      </h1>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <span className="px-3 py-1 rounded-full text-[11px] font-medium bg-white/70 border border-black/10 text-neutral-600">
          {current.tag}
        </span>
        <span className="px-3 py-1 rounded-full text-[11px] font-lcd border border-[#4ea743]/40 text-[#3f8f38] bg-[#eaf7e6]/90">
          {current.yieldEst}
        </span>
      </div>
    </div>
  );
}
