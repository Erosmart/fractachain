import type { ReactNode } from 'react';

export interface PillTabItem {
  key: string;
  label: ReactNode;
  href?: string;
  badge?: number;
  icon?: ReactNode;
}

/**
 * Segmented pills. With `href`s it is navigation (`aria-current`); with
 * `onChange` it is a tablist/segmented control (`aria-selected`).
 */
export function PillTabs({
  items,
  active,
  onChange,
  label,
  className = '',
}: {
  items: PillTabItem[];
  active: string;
  onChange?: (key: string) => void;
  label: string;
  className?: string;
}) {
  if (!onChange) {
    return (
      <nav aria-label={label} className={`pill-tabs max-w-full overflow-x-auto ${className}`}>
        {items.map((it) => (
          <a
            key={it.key}
            href={it.href}
            className="pill-tab"
            aria-current={it.key === active ? 'page' : undefined}
          >
            {it.icon}
            {it.label}
            {it.badge ? <span className="count-badge">{it.badge}</span> : null}
          </a>
        ))}
      </nav>
    );
  }
  return (
    <div role="tablist" aria-label={label} className={`pill-tabs max-w-full overflow-x-auto ${className}`}>
      {items.map((it) => (
        <button
          key={it.key}
          type="button"
          role="tab"
          aria-selected={it.key === active}
          className="pill-tab"
          onClick={() => onChange(it.key)}
        >
          {it.icon}
          {it.label}
          {it.badge ? <span className="count-badge">{it.badge}</span> : null}
        </button>
      ))}
    </div>
  );
}
