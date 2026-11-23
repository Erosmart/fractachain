import type { ReactNode } from 'react';
import { ArrowLink } from './Card';

/**
 * The sky → peach → butter panel that anchors a page (right column on
 * desktop, a strip under the greeting on mobile). Text stays ink — never
 * white on the pastel stops.
 */
export function GradientPanel({
  title,
  subtitle,
  href,
  hrefLabel,
  children,
  footer,
  className = '',
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  href?: string;
  hrefLabel?: string;
  children?: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`gradient-panel flex min-w-0 flex-col overflow-hidden ${className}`}>
      {(title || href) && (
        <header className="flex items-start justify-between gap-3 px-5 pt-5 sm:px-6 sm:pt-6">
          <div className="min-w-0">
            {title && <h2 className="title">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-ink-2">{subtitle}</p>}
          </div>
          {href && (
            <ArrowLink
              href={href}
              label={hrefLabel ?? 'Abrir'}
              className="bg-surface/50 hover:bg-surface/80"
            />
          )}
        </header>
      )}
      <div className="flex-1">{children}</div>
      {footer && <div className="px-4 pb-4 sm:px-5 sm:pb-5">{footer}</div>}
    </section>
  );
}

/** Muted bar at the bottom of a panel ("Te llamamos antes de las 11:00"). */
export function PanelNote({
  icon,
  children,
  href,
}: {
  icon?: ReactNode;
  children: ReactNode;
  href?: string;
}) {
  const body = (
    <>
      {icon && <span className="shrink-0 text-ink">{icon}</span>}
      <span className="min-w-0 text-[13px] font-medium text-ink">{children}</span>
    </>
  );
  const cls = 'flex items-center gap-3 rounded-xl bg-ink/[0.06] px-4 py-3';
  return href ? (
    <a href={href} className={`${cls} transition-colors hover:bg-ink/10`}>
      {body}
    </a>
  ) : (
    <div className={cls}>{body}</div>
  );
}
