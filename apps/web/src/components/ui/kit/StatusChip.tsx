import type { ReactNode } from 'react';
import { AlertTriangle, Check, CircleDashed, Clock3, Info, X } from 'lucide-react';

export type Tone = 'neutral' | 'sky' | 'good' | 'warn' | 'bad' | 'peach' | 'butter';

const ICONS: Record<Tone, typeof Check | null> = {
  neutral: CircleDashed,
  sky: Clock3,
  good: Check,
  warn: AlertTriangle,
  bad: X,
  peach: Info,
  butter: null,
};

/**
 * State as icon + label + tint — never color alone (WCAG 1.4.1).
 * `icon={false}` hides the icon for purely decorative tags.
 */
export function StatusChip({
  tone = 'neutral',
  children,
  icon,
  className = '',
}: {
  tone?: Tone;
  children: ReactNode;
  icon?: boolean | ReactNode;
  className?: string;
}) {
  const Icon = ICONS[tone];
  const glyph =
    icon === false ? null : icon && icon !== true ? (
      icon
    ) : Icon ? (
      <Icon className="h-3 w-3" aria-hidden="true" />
    ) : null;
  return (
    <span className={`chip chip-${tone} ${className}`}>
      {glyph}
      {children}
    </span>
  );
}
