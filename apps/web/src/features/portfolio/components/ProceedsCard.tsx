import ExternalLink from '@/components/ui/ExternalLink';
import { Card, StatusChip } from '@/components/ui/kit';
import type { Proceed } from '@/core/api/types';
import { useI18n } from '@/hooks/useI18n';
import { money } from '../model/format';

/** Issuer side: what each offering's on-chain close paid to this wallet. */
export function ProceedsCard({ proceeds, xlmOnChain }: { proceeds: Proceed[]; xlmOnChain?: number }) {
  const { t } = useI18n();
  if (!proceeds.length) return null;
  return (
    <Card
      title={t('dashboard.portfolio.proceedsTitle')}
      subtitle={`${t('dashboard.portfolio.proceedsSub')}${xlmOnChain !== undefined ? ` · ${t('dash.xlmOnChain', { n: money(xlmOnChain, 2) })}` : ''}`}
    >
      <ul className="divide-y divide-line/70">
        {proceeds.map((p) => (
          <li
            key={p.listingId}
            className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
          >
            <span className="min-w-0">
              <span className="block font-medium text-ink">{p.tokenTicker}</span>
              <span className="block truncate text-xs text-muted">{p.legalName}</span>
            </span>
            <span className="flex items-center gap-3">
              {!p.finalizeHash && p.status === 'LISTED' && (
                <StatusChip tone="sky">{t('dashboard.portfolio.proceedsPending')}</StatusChip>
              )}
              {p.explorer && (
                <ExternalLink
                  href={p.explorer}
                  className="text-xs text-ink-2 underline underline-offset-2 hover:text-ink"
                >
                  {t('dashboard.portfolio.proceedsTx')}
                </ExternalLink>
              )}
              <span className="text-sm font-medium text-ink tnum">
                {money(p.amount, p.paymentKind === 'XLM' ? 4 : 2)} {p.paymentKind === 'XLM' ? 'XLM' : 'USDC'}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
