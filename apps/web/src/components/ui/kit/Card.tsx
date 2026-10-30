import type { ReactNode } from 'react';
import { ArrowUpRight } from 'lucide-react';

export interface CardProps {
  title?: ReactNode;
  subtitle?: ReactNode;
  /** Corner ↗ link to the detail of whatever the card summarizes. */
  href?: string;
  hrefLabel?: string;
  /** Extra controls in the header (next to the arrow). */
  actions?: ReactNode;
  className?: string;
  bodyClassName?: string;
  as?: 'section' | 'article' | 'div';
  children?: ReactNode;
}

/** White card with a small title, a gray subtitle and an optional ↗ link — the base surface of the app. */
export function Card({
  title,
  subtitle,
  href,
  hrefLabel,
  actions,
  className = '',
  bodyClassName = '',
  as: Tag = 'section',
  children,
}: CardProps) {
  const hasHeader = Boolean(title || subtitle || href || actions);
  return (
    <Tag className={`card card-pad min-w-0 ${className}`}>
      {hasHeader && (
        <header className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            {title && <h2 className="title">{title}</h2>}
            {subtitle && <p className="subtitle mt-0.5">{subtitle}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {actions}
            {href && (
              <ArrowLink href={href} label={hrefLabel ?? (typeof title === 'string' ? title : 'Abrir')} />
            )}
          </div>
        </header>
      )}
      <div className={bodyClassName}>{children}</div>
    </Tag>
  );
}

/** The small square ↗ button used in card corners. */
export function ArrowLink({
  href,
  label,
  className = '',
}: {
  href: string;
  label: string;
  className?: string;
}) {
  return (
    <a href={href} className={`arrow-btn ${className}`} aria-label={label} title={label}>
      <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
    </a>
  );
}
