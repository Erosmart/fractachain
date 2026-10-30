import type { ReactNode } from 'react';

export interface StatProps {
  label: ReactNode;
  value: ReactNode;
  unit?: ReactNode;
  /** Signed change or a short note under the value ("−25 %", "en 3 días"). */
  delta?: ReactNode;
  deltaTone?: 'good' | 'bad' | 'neutral';
  size?: 'md' | 'lg' | 'xl';
  className?: string;
}

const SIZES = {
  md: 'text-[28px] sm:text-[32px]',
  lg: 'text-[36px] sm:text-[44px]',
  xl: 'text-[56px] sm:text-[72px]',
} as const;

/** Big light numeral with its unit and an optional delta — the oncopath stat tile. */
export function Stat({
  label,
  value,
  unit,
  delta,
  deltaTone = 'neutral',
  size = 'md',
  className = '',
}: StatProps) {
  const toneClass = deltaTone === 'good' ? 'text-good' : deltaTone === 'bad' ? 'text-bad' : 'text-ink-2';
  return (
    <div className={`min-w-0 ${className}`}>
      <p className="eyebrow">{label}</p>
      <p className="mt-2 flex items-baseline gap-1.5 text-ink">
        <span className={`numeral ${SIZES[size]}`}>{value}</span>
        {unit && <span className="text-xs text-ink-2">{unit}</span>}
      </p>
      {delta && <p className={`mt-1.5 text-xs font-medium ${toneClass}`}>{delta}</p>}
    </div>
  );
}

/** 2-column grid of stats separated by hairlines (no boxes). */
export function StatGrid({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`grid grid-cols-2 [&>*]:border-ink/10 [&>*]:px-5 [&>*]:py-5 [&>*:nth-child(odd)]:border-r [&>*:nth-child(n+3)]:border-t ${className}`}
    >
      {children}
    </div>
  );
}
