import { useId } from 'react';

/**
 * The Fractachain infinity, redrawn as line art for the light UI: a
 * continuous loop (sky → aqua) with token nodes on it. Inline SVG, so it
 * renders identically on server and client and follows the theme.
 */
export function BrandGlyph({ className = 'h-6 w-9' }: { className?: string }) {
  const gradient = `fc-glyph-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  return (
    <svg viewBox="0 0 36 20" className={className} aria-hidden="true" fill="none">
      <defs>
        <linearGradient id={gradient} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" style={{ stopColor: 'rgb(var(--viz-1))' }} />
          <stop offset="1" style={{ stopColor: 'rgb(var(--viz-3))' }} />
        </linearGradient>
      </defs>
      <path
        d="M18 10c-3-4.6-10-6.6-12.4-2.5-1.9 3.4.7 7.4 4.8 7.4 3.1 0 5.4-2.2 7.6-4.9s4.5-4.9 7.6-4.9c4.1 0 6.7 4 4.8 7.4C28 16.6 21 14.6 18 10z"
        stroke={`url(#${gradient})`}
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="18" cy="10" r="1.9" style={{ fill: 'rgb(var(--butter))' }} />
      <circle cx="5.6" cy="7.5" r="1.3" style={{ fill: 'rgb(var(--viz-1))' }} />
      <circle cx="30.4" cy="12.5" r="1.3" style={{ fill: 'rgb(var(--viz-3))' }} />
    </svg>
  );
}

/** Logo + wordmark linking home. Stateless: renders the same on server and client. */
export default function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <a
      href="/"
      className="inline-flex min-w-0 items-center gap-2 rounded-lg text-ink"
      aria-label="Fractachain"
    >
      <BrandGlyph />
      {!compact && (
        <span className="text-[19px] font-normal leading-none tracking-[-0.03em] max-[359px]:hidden">
          fractachain
        </span>
      )}
    </a>
  );
}
