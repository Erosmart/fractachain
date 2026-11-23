import type { ReactNode } from 'react';
import { ArrowUpRight, Check } from 'lucide-react';

export interface ChecklistItemProps {
  title: ReactNode;
  subtitle?: ReactNode;
  done?: boolean;
  /** Icon shown while not done (defaults to an empty square). */
  icon?: ReactNode;
  /** Right side: a time chip ("19:00"), a status chip… Defaults to ↗ when `href` is set. */
  trailing?: ReactNode;
  href?: string;
  className?: string;
}

/** A task row: check square (navy when done), title, gray subtitle, trailing chip or ↗. */
export function ChecklistItem({
  title,
  subtitle,
  done = false,
  icon,
  trailing,
  href,
  className = '',
}: ChecklistItemProps) {
  const body = (
    <>
      <span
        className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${
          done ? 'bg-navy text-navy-ink' : 'border border-line bg-surface text-ink-2'
        }`}
        aria-hidden="true"
      >
        {done ? <Check className="h-4 w-4" strokeWidth={2.5} /> : icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block break-words text-sm font-medium ${done ? 'text-ink-2' : 'text-ink'}`}>
          {title}
        </span>
        {subtitle && <span className="mt-0.5 block break-words text-xs text-muted">{subtitle}</span>}
      </span>
      {trailing ??
        (href ? <ArrowUpRight className="h-4 w-4 shrink-0 text-ink-2" aria-hidden="true" /> : null)}
      {done && <span className="sr-only">(hecho)</span>}
    </>
  );
  const cls = `flex min-w-0 items-center gap-3 rounded-2xl border border-line bg-surface px-3.5 py-3 ${className}`;
  return href ? (
    <a href={href} className={`${cls} transition-colors hover:border-line-strong hover:bg-surface-2`}>
      {body}
    </a>
  ) : (
    <div className={cls}>{body}</div>
  );
}
