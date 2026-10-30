import type { ReactNode } from 'react';
import { Info, Inbox } from 'lucide-react';

/** Empty state: soft icon, one line of title, one of body, one CTA. */
export function EmptyState({
  title,
  body,
  action,
  icon,
  className = '',
}: {
  title: ReactNode;
  body?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col items-center px-6 py-10 text-center ${className}`}>
      <span
        className="grid h-12 w-12 place-items-center rounded-2xl bg-sky-soft text-ink-2"
        aria-hidden="true"
      >
        {icon ?? <Inbox className="h-5 w-5" />}
      </span>
      <p className="mt-4 text-sm font-medium text-ink">{title}</p>
      {body && <p className="mt-1 max-w-sm text-sm text-muted">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/** Risk / regulatory notice on peach. Text is ink (never white on pastel). */
export function RiskCallout({
  children,
  title,
  className = '',
}: {
  children: ReactNode;
  title?: ReactNode;
  className?: string;
}) {
  return (
    <aside className={`flex gap-3 rounded-2xl bg-peach-soft px-4 py-3.5 text-ink ${className}`}>
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-ink-2" aria-hidden="true" />
      <div className="min-w-0 text-[13px] leading-relaxed">
        {title && <p className="font-medium">{title}</p>}
        <div className={title ? 'mt-0.5 text-ink-2' : 'text-ink-2'}>{children}</div>
      </div>
    </aside>
  );
}

/** Inline form/operation message with a role for screen readers. */
export function Notice({
  tone = 'sky',
  children,
  className = '',
}: {
  tone?: 'sky' | 'good' | 'warn' | 'bad';
  children: ReactNode;
  className?: string;
}) {
  const tones = {
    sky: 'bg-sky-soft text-ink',
    good: 'bg-good-soft text-good',
    warn: 'bg-warn-soft text-warn',
    bad: 'bg-bad-soft text-bad',
  } as const;
  return (
    <div
      role={tone === 'bad' ? 'alert' : 'status'}
      className={`rounded-xl px-3.5 py-2.5 text-sm ${tones[tone]} ${className}`}
    >
      {children}
    </div>
  );
}
