import { ArrowUpRight, Link2 } from 'lucide-react';
import ExternalLink from '@/components/ui/ExternalLink';
import { explorerContract } from '@/core/format/number';
import { useI18n } from '@/hooks/useI18n';
import { shortId } from './format';

/**
 * "Leído del contrato CABC1…XYZ12 ↗ · get_state(), get_total_raised()": the
 * provenance line under every figure read from a contract.
 */
export default function ChainSource({
  contractId,
  explorer,
  reads = [],
  readAt,
  className = '',
}: {
  contractId: string;
  explorer?: string;
  reads?: string[];
  readAt?: string;
  className?: string;
}) {
  const { t, locale } = useI18n();
  const time = readAt
    ? new Date(readAt).toLocaleTimeString(locale === 'en' ? 'en-US' : 'es-AR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    : null;
  return (
    <div className={`flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-ink-2 ${className}`}>
      <Link2 className="h-3 w-3 shrink-0" aria-hidden="true" />
      <span>{t('offerings.chain.readFrom')}</span>
      <ExternalLink
        href={explorer || explorerContract(contractId)}
        title={contractId}
        className="inline-flex items-center gap-0.5 font-mono text-ink underline-offset-2 hover:underline"
      >
        {shortId(contractId)}
        <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
      </ExternalLink>
      {time && <span className="text-muted">· {t('offerings.chain.readAt', { time })}</span>}
      {reads.length > 0 && (
        <details className="w-full text-muted">
          <summary className="cursor-pointer select-none text-[11px] hover:text-ink">
            {t('offerings.chain.functions', { n: reads.length })}
          </summary>
          <p className="mt-1 break-words font-mono text-[10.5px] leading-relaxed">
            {reads.map((r) => `${r}()`).join(' · ')}
          </p>
        </details>
      )}
    </div>
  );
}
