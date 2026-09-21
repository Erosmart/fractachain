'use client';

import React, { useState, useEffect } from 'react';
import { useI18n } from '../context/I18nContext';

export default function DynamicHeroText() {
  const { messages } = useI18n();
  const sectors = messages.hero.sectors;
  const [index, setIndex] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setIsAnimating(true);
      setTimeout(() => {
        setIndex((prev) => (prev + 1) % sectors.length);
        setIsAnimating(false);
      }, 400);
    }, 4500);
    return () => clearInterval(timer);
  }, [sectors.length]);

  const current = sectors[index % sectors.length];

  return (
    <div className="flex flex-col items-center justify-center gap-3 w-full px-1">
      <h1 className="flex flex-wrap items-baseline justify-center gap-x-[0.28em] gap-y-0 text-[2.15rem] sm:text-[3.45rem] xl:text-[3.9rem] font-extrabold tracking-tight text-black leading-[1.15] text-center max-w-full">
        <span className="font-display">{messages.hero.invert}</span>
        <span className="hero-lcd text-[1.02em] sm:text-[1.04em] inline-grid max-w-full items-center justify-items-center text-center">
          {sectors.map((s, i) => (
            <span
              key={i}
              aria-hidden={i !== index}
              className={`col-start-1 row-start-1 max-w-full transition-all duration-500 ease-out ${
                i === index
                  ? isAnimating
                    ? 'opacity-0 translate-y-5'
                    : 'opacity-100 translate-y-0'
                  : 'pointer-events-none opacity-0'
              }`}
            >
              {s.text}
            </span>
          ))}
        </span>
      </h1>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <span className="px-3.5 py-1 rounded-full text-xs font-medium bg-white/70 border border-black/10 text-neutral-600">
          {current.tag}
        </span>
        <span className="px-3.5 py-1 rounded-full text-xs font-lcd border border-[#4ea743]/40 text-[#3f8f38] bg-[#eaf7e6]/90">
          {current.yieldEst}
        </span>
      </div>
    </div>
  );
}
