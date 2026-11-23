import { useEffect, useState } from 'react';

export type HeroSector = {
  /** The rotating words after the lead word, e.g. "en vinos". */
  text: string;
  /** Where or what it is, e.g. "Valles Calchaquíes y Cuyo". */
  tag: string;
  /** Set for instruments that are roadmap, not live: shows the `soonLabel` chip. */
  soon?: boolean;
};

type Props = {
  /** Lead word, e.g. "Invertí". */
  lead: string;
  sectors: HeroSector[];
  /** The plain headline read by screen readers instead of the rotation. */
  srTitle: string;
  soonLabel: string;
};

const HOLD_MS = 3600;
const FADE_MS = 380;

/**
 * "Invertí / en vinos, en soja, en YPF…": the v1 hero headline. The visible
 * rotation is decorative (aria-hidden); the heading's accessible name is the
 * stable `srTitle`. It does not rotate under reduced motion or while the tab
 * is hidden.
 */
export default function HeroRotator({ lead, sectors, srTitle, soonLabel }: Props) {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (sectors.length < 2) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let fade: ReturnType<typeof setTimeout> | undefined;
    const timer = setInterval(() => {
      if (document.hidden) return;
      setVisible(false);
      fade = setTimeout(() => {
        setIndex((i) => (i + 1) % sectors.length);
        setVisible(true);
      }, FADE_MS);
    }, HOLD_MS);
    return () => {
      clearInterval(timer);
      if (fade) clearTimeout(fade);
    };
  }, [sectors.length]);

  const current = sectors[index] ?? sectors[0];
  if (!current) return null;
  const fadeClass = `transition-[opacity,transform] duration-[380ms] ease-out ${
    visible ? 'translate-y-0 opacity-100' : 'translate-y-1 opacity-0'
  }`;

  return (
    <div>
      <h1
        id="hero-title"
        className="text-[40px] font-light leading-[1.02] tracking-[-0.04em] text-ink sm:text-[64px] xl:text-[76px]"
      >
        <span className="sr-only">{srTitle}</span>
        <span aria-hidden="true">
          <span className="block">{lead}</span>
          <span
            className={`fc-brand-text block w-fit max-w-full min-h-[2.1em] pb-[0.12em] pr-[0.08em] font-serif font-normal italic tracking-[-0.02em] sm:min-h-0 sm:whitespace-nowrap ${fadeClass}`}
          >
            {current.text}
          </span>
        </span>
      </h1>
      <div aria-hidden="true" className={`mt-3 flex flex-wrap items-center gap-1.5 ${fadeClass}`}>
        <span className="chip chip-neutral">{current.tag}</span>
        {current.soon && <span className="chip chip-butter dark:text-navy-ink">{soonLabel}</span>}
      </div>
    </div>
  );
}
