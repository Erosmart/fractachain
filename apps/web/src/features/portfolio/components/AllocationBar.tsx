import { useState } from 'react';
import { useI18n } from '@/hooks/useI18n';
import { shareOf, type Segment, type Slot } from '../model/allocation';
import { money, pct } from '../model/format';

const FILL: Record<Exclude<Slot, 'other'>, string> = {
  1: 'bg-viz-1',
  2: 'bg-viz-2',
  3: 'bg-viz-3',
  4: 'bg-viz-4',
};
const fillOf = (slot: Slot) => (slot === 'other' ? 'bg-ink/25' : FILL[slot]);

/**
 * Horizontal 100 % bar (part-to-whole, ≤ 4 hues + a neutral fold). Segments
 * are split by a 2px surface gap; wide ones carry their share as a direct
 * label above; the legend lists every value, so hover only enhances.
 */
export function AllocationBar({
  title,
  segments,
  unit = 'USDC',
}: {
  title: string;
  segments: Segment[];
  unit?: string;
}) {
  const { t } = useI18n();
  const [active, setActive] = useState<string | null>(null);
  const total = segments.reduce((s, x) => s + x.value, 0);
  if (!segments.length || total <= 0) return null;
  const current = segments.find((s) => s.key === active);

  return (
    <figure className="m-0 min-w-0">
      <figcaption className="mb-2 flex items-baseline justify-between gap-3">
        <span className="text-xs font-medium text-ink-2">{title}</span>
        <span className="text-xs text-muted tnum" aria-live="polite">
          {current
            ? `${current.label} · ${money(current.value)} ${unit} · ${pct(shareOf(segments, current))}`
            : `${money(total)} ${unit}`}
        </span>
      </figcaption>
      <div className="relative h-5 text-[11px] text-ink-2 tnum" aria-hidden="true">
        {(() => {
          let left = 0;
          return segments.map((s) => {
            const share = s.value / total;
            const node =
              share >= 0.1 ? (
                <span
                  key={s.key}
                  className="absolute bottom-1 whitespace-nowrap"
                  style={{ left: `${left * 100}%` }}
                >
                  {pct(share)}
                </span>
              ) : null;
            left += share;
            return node;
          });
        })()}
      </div>
      <div
        className="flex h-3 w-full gap-[2px] overflow-hidden rounded-full"
        role="img"
        aria-label={`${title}: ${segments.map((s) => `${s.label} ${pct(shareOf(segments, s))}`).join(', ')}`}
        onPointerLeave={() => setActive(null)}
      >
        {segments.map((s) => (
          <div
            key={s.key}
            className={`${fillOf(s.slot)} h-full transition-opacity first:rounded-l-full last:rounded-r-full ${
              active && active !== s.key ? 'opacity-50' : ''
            }`}
            style={{ flexGrow: s.value, flexBasis: 0, minWidth: 4 }}
            onPointerEnter={() => setActive(s.key)}
          />
        ))}
      </div>
      <ul className="mt-3 grid gap-y-1.5 text-xs">
        {segments.map((s) => (
          <li key={s.key} className="flex min-w-0 items-center gap-2">
            <span className={`h-2.5 w-2.5 shrink-0 rounded-[3px] ${fillOf(s.slot)}`} aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate text-ink-2">{s.label}</span>
            <span className="text-ink tnum">{money(s.value)}</span>
            <span className="w-12 text-right text-muted tnum">{pct(shareOf(segments, s))}</span>
          </li>
        ))}
      </ul>
      <span className="sr-only">{t('dashboard.portfolio.allocationSub')}</span>
    </figure>
  );
}
