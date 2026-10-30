import { ShieldCheck } from 'lucide-react';
import { Gauge, GradientPanel, PanelNote, StatusChip } from '@/components/ui/kit';
import { formatAmount, formatInt } from '@/core/format/number';
import { useI18n } from '@/hooks/useI18n';
import type { StockVaultView } from '../model';

/**
 * Proof of reserve of a vault, read from `get_metadata`: shares in custody
 * per token minted (one number → a gauge), when the custody was last
 * audited, whether minting is paused and the last mint attestation.
 */
export default function ReserveProof({ vault }: { vault: StockVaultView }) {
  const { t, locale } = useI18n();
  const k = (key: string, vars?: Record<string, string | number>) => t(`markets.stocks.por.${key}`, vars);
  const pct = vault.backingPct;
  const when = vault.lastAudit
    ? vault.lastAudit.toLocaleDateString(locale === 'en' ? 'en-US' : 'es-AR', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : '—';
  const cell = (label: string, value: string) => (
    <div className="min-w-0">
      <dt className="text-xs text-ink-2">{label}</dt>
      <dd className="mt-1 truncate text-sm font-medium text-ink tnum">{value}</dd>
    </div>
  );
  return (
    <GradientPanel
      title={k('title')}
      subtitle={k('subtitle')}
      footer={
        <PanelNote icon={<ShieldCheck className="h-4 w-4" aria-hidden="true" />}>{k('note')}</PanelNote>
      }
    >
      <div className="px-4 pt-2">
        {pct === null ? (
          <p className="px-2 py-10 text-center text-sm text-ink-2">{k('nothingMinted')}</p>
        ) : (
          <Gauge
            value={Math.min(pct, 100)}
            max={100}
            display={`${formatAmount(pct, pct % 1 ? 1 : 0)}%`}
            caption={`${vault.ticker} · ${k('caption')}`}
            minLabel="0"
            maxLabel="100 %"
            ariaLabel={k('aria', { sym: vault.ticker, p: formatAmount(pct, 1) })}
          />
        )}
      </div>
      <dl className="mt-2 grid grid-cols-2 [&>div]:border-t [&>div]:border-ink/10 [&>div]:px-5 [&>div]:py-4 sm:[&>div]:px-6 [&>div:nth-child(odd)]:border-r">
        {cell(k('tokens'), vault.tokensMinted === null ? '—' : formatInt(vault.tokensMinted))}
        {cell(k('shares'), vault.sharesCustodied === null ? '—' : formatInt(vault.sharesCustodied))}
        {cell(k('lastAudit'), when)}
        <div className="min-w-0">
          <dt className="text-xs text-ink-2">{k('minting')}</dt>
          <dd className="mt-1">
            <StatusChip tone={vault.mintPaused ? 'warn' : 'good'}>
              {vault.mintPaused ? k('paused') : k('enabled')}
            </StatusChip>
          </dd>
        </div>
      </dl>
    </GradientPanel>
  );
}
