import { useEffect, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { useI18n } from '@/hooks/useI18n';

/** Shortens an id/hash to `ABCDEF…UVWXYZ` (keeps short values intact). */
export function shorten(value: string, head = 6, tail = 6): string {
  return value.length > head + tail + 1 ? `${value.slice(0, head)}…${value.slice(-tail)}` : value;
}

/**
 * Monospace value, truncated in the middle, with a copy button. The full
 * value stays in `title` and is what gets copied.
 */
export function CopyValue({
  value,
  label,
  head = 6,
  tail = 6,
  href,
  className = '',
}: {
  value: string;
  /** Accessible name of the copy button (defaults to "Copiar"). */
  label?: string;
  head?: number;
  tail?: number;
  /** Optional explorer link for the value. */
  href?: string;
  className?: string;
}) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      // clipboard blocked: the value stays visible in the title
    }
  };
  const text = shorten(value, head, tail);
  return (
    <span className={`inline-flex min-w-0 max-w-full items-center gap-1 ${className}`}>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          title={value}
          className="min-w-0 truncate font-mono text-xs text-ink underline decoration-line-strong underline-offset-2 hover:decoration-ink"
        >
          {text}
        </a>
      ) : (
        <span title={value} className="min-w-0 truncate font-mono text-xs text-ink">
          {text}
        </span>
      )}
      <button
        type="button"
        onClick={() => void copy()}
        className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-muted transition-colors hover:bg-ink/5 hover:text-ink"
        aria-label={copied ? t('admin.common.copied') : (label ?? t('admin.common.copy'))}
        title={copied ? t('admin.common.copied') : (label ?? t('admin.common.copy'))}
      >
        {copied ? (
          <Check className="h-3.5 w-3.5" aria-hidden="true" />
        ) : (
          <Copy className="h-3.5 w-3.5" aria-hidden="true" />
        )}
      </button>
    </span>
  );
}
