import type { ReactNode } from 'react';
import { ArrowUpRight } from 'lucide-react';
import ExternalLink from '@/components/ui/ExternalLink';
import { useI18n } from '@/hooks/useI18n';
import type { ReadSource } from '../../model';

export function timeOf(date: Date | null, locale: string): string {
  return date
    ? date.toLocaleTimeString(locale === 'en' ? 'en-US' : 'es-AR', { hour: '2-digit', minute: '2-digit' })
    : '—';
}

/**
 * Where a card's values come from: the contract (↗ Stellar Expert), the
 * functions called and when. Shown on every chain-read card.
 */
export function SourceLine({ source }: { source: ReadSource }) {
  const { t, locale } = useI18n();
  return (
    <div className="space-y-1 text-[11px] leading-relaxed text-muted">
      <p className="flex flex-wrap items-center gap-x-1.5">
        <span>{t('markets.chain.contract')}</span>
        <ExternalLink
          href={source.explorer}
          className="inline-flex items-center gap-0.5 font-mono text-ink-2 underline decoration-line-strong underline-offset-2 hover:text-ink"
          title={source.contractId}
          aria-label={t('markets.chain.contractAria', { id: source.contractId })}
        >
          {source.shortId}
          <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
        </ExternalLink>
        {source.readAt && <span>· {t('markets.chain.readAt', { time: timeOf(source.readAt, locale) })}</span>}
      </p>
      {source.reads.length > 0 && (
        <p className="break-words">
          {t('markets.chain.readFrom')}{' '}
          <span className="font-mono text-ink-2">{source.reads.map((r) => `${r}()`).join(', ')}</span>
        </p>
      )}
    </div>
  );
}

/** A deployed contract instance: title + status, its values, its (disabled) actions and its source. */
export default function ChainCard({
  title,
  subtitle,
  status,
  source,
  children,
  actions,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  status?: ReactNode;
  source: ReadSource;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <article className="card card-pad flex min-w-0 flex-col gap-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[17px] font-medium leading-snug text-ink">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
        </div>
        {status}
      </header>
      <div className="min-w-0">{children}</div>
      {actions}
      <footer className="border-t border-line pt-3">
        <SourceLine source={source} />
      </footer>
    </article>
  );
}
