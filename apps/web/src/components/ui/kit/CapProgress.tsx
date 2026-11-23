import { useI18n } from '@/hooks/useI18n';

export interface CapProgressProps {
  raised: number;
  softCap: number;
  hardCap: number;
  format: (value: number) => string;
  /** Hide the labels row (compact cards). */
  compact?: boolean;
  className?: string;
}

/**
 * Funding progress against the hard cap, with the soft cap (minimum to
 * close) marked on the track. Exposed as a progressbar.
 */
export function CapProgress({
  raised,
  softCap,
  hardCap,
  format,
  compact = false,
  className = '',
}: CapProgressProps) {
  const { t } = useI18n();
  const cap = Math.max(hardCap, Number.EPSILON);
  const fill = Math.min(100, (raised / cap) * 100);
  const soft = Math.min(100, (softCap / cap) * 100);
  const reachedSoft = raised >= softCap && softCap > 0;
  return (
    <div className={`min-w-0 ${className}`}>
      <div
        className="relative h-2 rounded-full bg-sky-soft"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={hardCap}
        aria-valuenow={raised}
        aria-valuetext={`${format(raised)} ${t('shell.kit.of')} ${format(hardCap)} · ${t('shell.kit.min')} ${format(softCap)}`}
      >
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            width: `${fill}%`,
            background: 'linear-gradient(90deg, rgb(var(--sky-strong)), rgb(var(--sky)))',
          }}
        />
        {softCap > 0 && soft < 100 && (
          <div
            className={`absolute -top-1 h-4 w-[2px] rounded-full ${reachedSoft ? 'bg-ink' : 'bg-ink/45'}`}
            style={{ left: `calc(${soft}% - 1px)` }}
            aria-hidden="true"
          />
        )}
      </div>
      {!compact && (
        <div className="relative mt-2 h-4 text-[11px] text-muted tnum" aria-hidden="true">
          {softCap > 0 && soft < 100 && (
            <span
              className={`absolute whitespace-nowrap ${soft > 70 ? '-translate-x-full' : soft < 15 ? '' : '-translate-x-1/2'}`}
              style={{ left: `${soft}%` }}
            >
              {t('shell.kit.min')} {format(softCap)}
            </span>
          )}
          {soft <= 70 && (
            <span className="absolute right-0 whitespace-nowrap">
              {t('shell.kit.max')} {format(hardCap)}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
