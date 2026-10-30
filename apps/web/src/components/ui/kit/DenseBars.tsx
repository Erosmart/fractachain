import { useId, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useI18n } from '@/hooks/useI18n';

export interface BarDatum {
  key: string;
  /** Full label for tooltip and table ("15 oct 2026"). */
  label: string;
  /** `null` = no data yet (future slot): drawn as a faint placeholder. */
  value: number | null;
  /** Second series: projected instead of realized (hatched, same hue). */
  projected?: boolean;
}

export interface DenseBarsProps {
  data: BarDatum[];
  /** Formats values for tooltip, table and labels. */
  format: (value: number) => string;
  /** Short accessible summary of what the chart shows. */
  summary: string;
  /** Caption of the table view (defaults to `summary`). */
  tableCaption?: string;
  /** Column headers of the table view. */
  columns?: [string, string];
  /** Horizontal threshold (dashed: it reads as a threshold, not a grid). */
  reference?: { value: number; label: string };
  /** Bar drawn in ink with a butter pill above it ("0,9 · hoy"). */
  highlightKey?: string;
  highlightLabel?: ReactNode;
  /** X-axis labels at given data indexes ("C1 · 3 sep"). */
  ticks?: { index: number; label: string }[];
  /** Legend for the two series; shown only when projected bars exist. */
  legend?: { actual: string; projected: string };
  max?: number;
  height?: number;
  className?: string;
}

const PLACEHOLDER = 'repeating-linear-gradient(to top, rgb(var(--ink) / 0.10) 0 2px, transparent 2px 5px)';
const HATCH =
  'repeating-linear-gradient(135deg, rgb(var(--sky-strong) / 0.55) 0 2px, rgb(var(--sky-strong) / 0.14) 2px 5px)';

/**
 * Dense column chart in the oncopath style: thin bars sharing one sky →
 * peach gradient field (taller bars reach further into the sky), placeholder
 * slots for the future, an optional dashed threshold and a highlighted
 * "today" bar.
 *
 * Interaction: each bar shows a tooltip on hover; the chart is one tab stop
 * and ←/→ move between bars (same readout as hover). "Ver tabla" swaps in
 * the data table, so no value is gated behind the tooltip.
 */
export function DenseBars({
  data,
  format,
  summary,
  tableCaption,
  columns,
  reference,
  highlightKey,
  highlightLabel,
  ticks = [],
  legend,
  max,
  height = 168,
  className = '',
}: DenseBarsProps) {
  const { t } = useI18n();
  const [active, setActive] = useState<number | null>(null);
  const [asTable, setAsTable] = useState(false);
  const tooltipId = useId();

  const top = useMemo(() => {
    const values = data.map((d) => d.value ?? 0);
    return Math.max(max ?? 0, reference?.value ?? 0, ...values, Number.EPSILON) * 1.08;
  }, [data, max, reference]);

  const hasProjected = data.some((d) => d.projected && d.value !== null);
  const highlightIndex = highlightKey ? data.findIndex((d) => d.key === highlightKey) : -1;
  const pct = (v: number) => `${Math.max(0, Math.min(100, (v / top) * 100))}%`;
  const activeDatum = active === null ? undefined : data[active];

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!data.length) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const step = e.key === 'ArrowRight' ? 1 : -1;
      setActive((cur) =>
        Math.min(data.length - 1, Math.max(0, (cur ?? (step > 0 ? -1 : data.length)) + step)),
      );
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      setActive(e.key === 'Home' ? 0 : data.length - 1);
    } else if (e.key === 'Escape') {
      setActive(null);
    }
  };

  return (
    <div className={`min-w-0 ${className}`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        {hasProjected && legend ? (
          <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-2">
            <li className="flex items-center gap-1.5">
              <span
                className="h-3 w-2 rounded-[2px]"
                style={{ background: 'var(--bar-gradient)' }}
                aria-hidden="true"
              />
              {legend.actual}
            </li>
            <li className="flex items-center gap-1.5">
              <span className="h-3 w-2 rounded-[2px]" style={{ background: HATCH }} aria-hidden="true" />
              {legend.projected}
            </li>
          </ul>
        ) : (
          <span />
        )}
        <button type="button" className="btn btn-ghost btn-sm -mr-2" onClick={() => setAsTable((v) => !v)}>
          {asTable ? t('shell.kit.hideTable') : t('shell.kit.showTable')}
        </button>
      </div>

      {asTable ? (
        <div className="max-h-72 overflow-auto rounded-xl border border-line">
          <table className="table-clean">
            <caption className="sr-only">{tableCaption ?? summary}</caption>
            <thead>
              <tr>
                <th scope="col">{columns?.[0] ?? ''}</th>
                <th scope="col" className="!text-right">
                  {columns?.[1] ?? ''}
                </th>
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.key}>
                  <td>
                    {d.label}
                    {d.projected && d.value !== null && legend ? (
                      <span className="ml-2 text-xs text-muted">· {legend.projected}</span>
                    ) : null}
                  </td>
                  <td className="text-right">{d.value === null ? '—' : format(d.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <figure className="m-0">
          <div
            role="group"
            tabIndex={0}
            aria-label={summary}
            aria-describedby={activeDatum ? tooltipId : undefined}
            onKeyDown={onKeyDown}
            onBlur={() => setActive(null)}
            onPointerLeave={() => setActive(null)}
            className="relative rounded-lg outline-offset-4"
            style={{ height }}
          >
            {/* Baseline hairline */}
            <div className="absolute inset-x-0 bottom-0 h-px bg-line-strong" aria-hidden="true" />

            {reference && (
              <div
                className="pointer-events-none absolute inset-x-0 border-t border-dashed border-ink/35"
                style={{ bottom: pct(reference.value) }}
                aria-hidden="true"
              >
                <span className="absolute -top-5 right-0 bg-surface/80 px-1 text-[11px] text-ink-2">
                  {reference.label}
                </span>
              </div>
            )}

            <div className="absolute inset-0 flex items-end gap-[3px]">
              {data.map((d, i) => {
                const isHighlight = i === highlightIndex;
                const isActive = i === active;
                const empty = d.value === null;
                const style = empty
                  ? { height: '100%', background: PLACEHOLDER }
                  : {
                      height: pct(d.value as number),
                      minHeight: (d.value as number) > 0 ? 3 : 0,
                      background: isHighlight
                        ? 'rgb(var(--ink))'
                        : d.projected
                          ? HATCH
                          : 'var(--bar-gradient)',
                      backgroundSize: isHighlight || d.projected ? undefined : `100% ${height}px`,
                      backgroundPosition: 'bottom',
                    };
                return (
                  <div
                    key={d.key}
                    className="relative flex h-full min-w-[2px] max-w-[12px] flex-1 items-end justify-center"
                    onPointerEnter={() => setActive(i)}
                  >
                    <div
                      className={`w-full rounded-t-[4px] transition-opacity ${
                        active !== null && !isActive ? 'opacity-60' : ''
                      } ${empty ? 'rounded-t-none' : ''}`}
                      style={style}
                    />
                    {isHighlight && highlightLabel && (
                      <span
                        className="absolute z-10 -translate-y-2 whitespace-nowrap rounded-md bg-butter px-2 py-0.5 text-[11px] font-medium text-ink shadow-card"
                        style={{ bottom: empty ? '100%' : pct(d.value as number) }}
                      >
                        {highlightLabel}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            {activeDatum && (
              <div
                id={tooltipId}
                role="status"
                className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full rounded-lg border border-line bg-surface px-3 py-2 shadow-lift"
                style={{
                  left: `${((active! + 0.5) / data.length) * 100}%`,
                  bottom: activeDatum.value === null ? '100%' : `calc(${pct(activeDatum.value)} + 10px)`,
                }}
              >
                <p className="whitespace-nowrap text-sm font-semibold text-ink tnum">
                  {activeDatum.value === null ? '—' : format(activeDatum.value)}
                </p>
                <p className="whitespace-nowrap text-[11px] text-muted">
                  {activeDatum.label}
                  {activeDatum.projected && legend ? ` · ${legend.projected}` : ''}
                </p>
              </div>
            )}
          </div>

          {ticks.length > 0 && (
            <div className="relative mt-2 h-4 text-[11px] text-muted tnum" aria-hidden="true">
              {ticks.map((tk, n) => {
                const left = ((tk.index + 0.5) / Math.max(1, data.length)) * 100;
                const edge =
                  n === ticks.length - 1 && left > 85
                    ? '-translate-x-full'
                    : n === 0 && left < 15
                      ? ''
                      : '-translate-x-1/2';
                return (
                  <span
                    key={`${tk.index}-${tk.label}`}
                    className={`absolute whitespace-nowrap ${edge}`}
                    style={{ left: `${left}%` }}
                  >
                    {tk.label}
                  </span>
                );
              })}
            </div>
          )}
        </figure>
      )}
    </div>
  );
}
