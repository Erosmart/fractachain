import { useEffect, useState, type ReactNode } from 'react';
import { useI18n } from '@/hooks/useI18n';

export function initials(name: string | undefined): string {
  const parts = String(name || '')
    .replace(/@.*/, '')
    .split(/[\s._-]+/)
    .filter(Boolean);
  const letters =
    (parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : (parts[0]?.[1] ?? ''));
  return letters.toUpperCase() || '·';
}

/** Initials square ("MG"). */
export function Avatar({ name, className = '' }: { name?: string; className?: string }) {
  return (
    <span
      className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-surface-2 text-[11px] font-semibold tracking-wide text-ink ring-1 ring-line ${className}`}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}

function greetingKey(hour: number): 'morning' | 'afternoon' | 'evening' {
  if (hour >= 5 && hour < 13) return 'morning';
  if (hour >= 13 && hour < 20) return 'afternoon';
  return 'evening';
}

/**
 * "Buen día, María" + a second line in muted ink. The time of day is read
 * after mount (the server doesn't know the visitor's clock).
 */
export function Greeting({
  name,
  children,
  className = '',
}: {
  name?: string;
  children?: ReactNode;
  className?: string;
}) {
  const { t } = useI18n();
  const [key, setKey] = useState<'morning' | 'afternoon' | 'evening'>('morning');
  useEffect(() => setKey(greetingKey(new Date().getHours())), []);
  const first = String(name || '')
    .trim()
    .split(/\s+/)[0];
  return (
    <div className={`min-w-0 ${className}`}>
      <h1 className="text-[26px] font-normal leading-tight tracking-[-0.02em] text-ink sm:text-[30px]">
        {t(`shell.greeting.${key}`)}
        {first ? `, ${first}` : ''}
      </h1>
      {children && (
        <p className="mt-1 text-[22px] font-light leading-snug tracking-[-0.02em] text-ink-2 sm:text-[26px]">
          {children}
        </p>
      )}
    </div>
  );
}

/** Page title block for non-dashboard pages. */
export function PageHeader({
  title,
  subtitle,
  actions,
  eyebrow,
  className = '',
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
  className?: string;
}) {
  return (
    <header className={`flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between ${className}`}>
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
        <h1 className="text-[28px] font-normal leading-tight tracking-[-0.025em] text-ink sm:text-[34px]">
          {title}
        </h1>
        {subtitle && <p className="mt-1.5 max-w-2xl text-[15px] text-ink-2">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
