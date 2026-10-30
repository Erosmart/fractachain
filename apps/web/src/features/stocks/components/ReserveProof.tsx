import { ShieldCheck } from 'lucide-react';
import { Gauge, GradientPanel, PanelNote } from '@/components/ui/kit';
import { formatInt } from '@/core/format/number';
import { useI18n } from '@/hooks/useI18n';
import type { StockCustody } from '../model';

/**
 * Proof of reserve for the selected stock: share of circulating tokens with a
 * share in custody (a single number → a gauge, not a chart), plus the
 * custody facts.
 */
export default function ReserveProof({ stock }: { stock: StockCustody | null }) {
  const { t, locale } = useI18n();
  const recon = (raw?: string) => {
    const ms = raw ? Date.parse(raw.replace(' UTC', 'Z').replace(' ', 'T')) : NaN;
    return Number.isFinite(ms)
      ? new Date(ms).toLocaleString(locale === 'en' ? 'en-US' : 'es-AR', {
          day: 'numeric',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        })
      : raw || '—';
  };
  const tokens = stock?.tokensCirculating ?? 0;
  const shares = stock?.totalSharesInCustody ?? 0;
  const pct = tokens > 0 ? Math.min(100, Math.round((shares / tokens) * 1000) / 10) : 100;
  const k = (key: string) => t(`markets.stocks.por.${key}`);
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
        <Gauge
          value={pct}
          max={100}
          display={`${pct}%`}
          caption={`${stock?.symbol ?? '—'} · ${k('caption')}`}
          minLabel="0"
          maxLabel="100 %"
          ariaLabel={t('markets.stocks.por.aria', { sym: stock?.symbol ?? '', p: pct })}
        />
      </div>
      <dl className="mt-2 grid grid-cols-2 [&>div]:border-ink/10 [&>div]:px-5 [&>div]:py-4 sm:[&>div]:px-6 [&>div:nth-child(odd)]:border-r [&>div]:border-t">
        {cell(k('tokens'), formatInt(tokens))}
        {cell(k('shares'), formatInt(shares))}
        {cell(k('subaccount'), stock?.cajaDeValoresSubaccount || '—')}
        {cell(k('auditor'), stock?.auditor || '—')}
        {cell(k('lastRecon'), recon(stock?.lastAuditTimestamp))}
        {cell(k('settlement'), k('t0'))}
      </dl>
    </GradientPanel>
  );
}
