import type { ReactNode } from 'react';

export interface GaugeProps {
  value: number;
  min?: number;
  max: number;
  /** Text inside the numeral slot (defaults to the value). */
  display?: ReactNode;
  /** Small white chip under the numeral ("USDC · aportado"). */
  caption?: ReactNode;
  minLabel?: ReactNode;
  maxLabel?: ReactNode;
  /** Accessible summary, e.g. "62 % del tope recaudado". */
  ariaLabel: string;
  /** Optional marker (e.g. the soft cap) drawn as a longer tick. */
  marker?: number;
  className?: string;
}

const TICKS = 64;
/** Arc width in degrees, centered on 12 o'clock. */
const SWEEP = 230;

/** Rounded so server and browser render identical attributes (no hydration mismatch). */
const r2 = (n: number) => Math.round(n * 100) / 100;

function polar(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: r2(cx + r * Math.cos(rad)), y: r2(cy + r * Math.sin(rad)) };
}

const VIEW_W = 300;
const VIEW_H = 240;

/**
 * Radial tick gauge with a big light numeral in the middle. Ticks up to the
 * value are ink, the rest a faint step of the same ink (state reads across
 * the whole arc). A single value: no hover layer.
 */
export function Gauge({
  value,
  min = 0,
  max,
  display,
  caption,
  minLabel,
  maxLabel,
  ariaLabel,
  marker,
  className = '',
}: GaugeProps) {
  const span = Math.max(max - min, Number.EPSILON);
  const frac = Math.min(1, Math.max(0, (value - min) / span));
  const markerFrac = marker === undefined ? undefined : Math.min(1, Math.max(0, (marker - min) / span));
  const cx = 150;
  const cy = 150;
  const ticks = Array.from({ length: TICKS + 1 }, (_, i) => {
    const t = i / TICKS;
    const deg = -SWEEP / 2 + t * SWEEP;
    const isMarker = markerFrac !== undefined && Math.abs(t - markerFrac) < 0.5 / TICKS;
    const major = i % 8 === 0;
    const inner = isMarker ? 104 : major ? 112 : 116;
    const a = polar(cx, cy, inner, deg);
    const b = polar(cx, cy, 128, deg);
    const on = t <= frac + 1e-9;
    return { a, b, on, isMarker, major, key: i };
  });
  return (
    <figure
      className={`relative mx-auto w-full max-w-[320px] ${className}`}
      role="img"
      aria-label={ariaLabel}
    >
      <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className="block w-full" aria-hidden="true">
        {ticks.map((tk) => (
          <line
            key={tk.key}
            x1={tk.a.x}
            y1={tk.a.y}
            x2={tk.b.x}
            y2={tk.b.y}
            stroke="rgb(var(--ink))"
            strokeOpacity={tk.on ? 0.9 : tk.isMarker ? 0.55 : 0.22}
            strokeWidth={tk.isMarker ? 2.4 : tk.on ? 2 : 1.4}
            strokeLinecap="round"
          />
        ))}
      </svg>
      <div className="pointer-events-none absolute inset-x-0 top-[34%] flex flex-col items-center">
        <span className="numeral text-[64px] text-ink sm:text-[76px]">{display ?? value}</span>
        {caption && (
          <span className="mt-3 rounded-md bg-surface px-2.5 py-1 text-xs font-medium text-ink shadow-card">
            {caption}
          </span>
        )}
      </div>
      {[
        { label: minLabel, at: polar(cx, cy, 128, -SWEEP / 2) },
        { label: maxLabel, at: polar(cx, cy, 128, SWEEP / 2) },
      ].map(({ label, at }, n) =>
        label === undefined ? null : (
          // Just under each end of the arc.
          <span
            key={n}
            className="absolute -translate-x-1/2 whitespace-nowrap text-[11px] text-ink-2 tnum"
            style={{ left: `${(at.x / VIEW_W) * 100}%`, top: `${((at.y + 12) / VIEW_H) * 100}%` }}
          >
            {label}
          </span>
        ),
      )}
    </figure>
  );
}
