'use client';

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useI18n } from '../context/I18nContext';

export default function DynamicHeroText() {
  const { messages } = useI18n();
  const sectors = messages.hero.sectors;
  const [index, setIndex] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [slotWidth, setSlotWidth] = useState<number | null>(null);
  const measureRefs = useRef<Array<HTMLSpanElement | null>>([]);

  const active = index % sectors.length;
  const current = sectors[active];

  const measureActive = useCallback(() => {
    const el = measureRefs.current[active];
    if (!el) return;
    // Italic glyphs paint a little past the box; a few px avoids clipping the last letter.
    const next = Math.ceil(el.getBoundingClientRect().width) + 6;
    setSlotWidth((prev) => (prev === next ? prev : next));
  }, [active]);

  useLayoutEffect(() => {
    measureActive();
  }, [measureActive, sectors]);

  useEffect(() => {
    measureActive();
    const onResize = () => measureActive();
    window.addEventListener('resize', onResize);
    let cancelled = false;
    document.fonts?.ready.then(() => {
      if (!cancelled) measureActive();
    });
    return () => {
      cancelled = true;
      window.removeEventListener('resize', onResize);
    };
  }, [measureActive]);

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

  return (
    <div className="flex flex-col items-center justify-center gap-3 w-full px-1">
      <h1 className="flex flex-wrap items-baseline justify-center gap-x-[0.28em] gap-y-0 text-[2.15rem] sm:text-[3.45rem] xl:text-[3.9rem] font-extrabold tracking-tight text-black leading-[1.15] text-center max-w-full">
        <span className="font-display">{messages.hero.invert}</span>
        <span className="hero-lcd relative inline-block max-w-full text-[1.02em] sm:text-[1.04em] align-baseline">
          <span className="pointer-events-none absolute left-0 top-0 -z-10 h-0 overflow-hidden opacity-0" aria-hidden>
            {sectors.map((s, i) => (
              <span
                key={`measure-${s.text}`}
                ref={(node) => {
                  measureRefs.current[i] = node;
                }}
                className="inline-block whitespace-nowrap"
              >
                {s.text}
              </span>
            ))}
          </span>
          <span
            className="hero-slot inline-block min-w-0 whitespace-nowrap align-baseline leading-[1.15] transition-[width] duration-500 ease-out"
            style={{ width: slotWidth ?? undefined }}
          >
            <span
              className={`inline whitespace-nowrap transition-opacity duration-500 ease-out ${
                isAnimating ? 'opacity-0' : 'opacity-100'
              }`}
            >
              {current.text}
            </span>
          </span>
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
