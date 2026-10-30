import { RotateCcw, Send } from 'lucide-react';
import { Card, Notice } from '@/components/ui/kit';
import WalletAddress from '@/components/ui/WalletAddress';
import { formatAmount } from '@/core/format/number';
import { useI18n } from '@/hooks/useI18n';
import type { Offering } from '../../hooks/useOffering';
import { money } from '../../model';

/** What the signed-in investor holds in this offering and what they can do with it. */
export default function PositionCard({ offering }: { offering: Offering }) {
  const { t } = useI18n();
  const { listing, user, holding, unit, onChain, phase, busy, actions } = offering;
  if (!listing || !user || !holding) return null;
  const d = listing.dossier;
  const tokens = Number(holding.tokens || 0);
  const onChainUnits = Number(holding.tokensOnChain || 0);
  const pendingOnChain = Math.max(0, tokens - onChainUnits);
  const success = phase === 'closed' || phase === 'payingIncome';
  const failed = phase === 'failed' || phase === 'refundAvailable';
  const canClaim =
    success &&
    Boolean(user.trustlines?.includes(listing.id)) &&
    (holding.tokensOwed || 0) > 0 &&
    !holding.refundedAt;
  const canRefund = Boolean(onChain.live) && failed && !holding.refundedAt;
  if (tokens <= 0 && onChainUnits <= 0 && !(holding.usdcAmount > 0)) return null;

  const stat = (label: string, value: string) => (
    <div className="min-w-0">
      <dt className="eyebrow">{label}</dt>
      <dd className="numeral mt-1.5 truncate text-[26px] text-ink">{value}</dd>
    </div>
  );

  return (
    <Card title={t('offerings.position.title')}>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-5">
        {stat(t('offerings.position.contributed'), money(holding.usdcAmount || 0, unit))}
        {stat(t('offerings.position.tokens'), formatAmount(tokens, tokens % 1 ? 2 : 0))}
        {stat(t('offerings.position.inWallet'), formatAmount(onChainUnits, onChainUnits % 1 ? 2 : 0))}
        {stat(t('offerings.position.pending'), formatAmount(pendingOnChain, pendingOnChain % 1 ? 2 : 0))}
      </dl>

      {d.issuerPublicKey ? (
        <div className="mt-5 rounded-xl bg-surface-2 px-3.5 py-3">
          <p className="eyebrow">{t('offerings.position.asset')}</p>
          <p className="mt-1 text-sm font-medium text-ink">{d.tokenTicker}</p>
          <div className="mt-0.5">
            <WalletAddress address={d.issuerPublicKey} compact />
          </div>
          <p className="mt-2 text-xs leading-relaxed text-muted">
            {user.custodyMode === 'SELF' ? t('market.freighterHintSelf') : t('market.freighterHintCustodial')}
          </p>
        </div>
      ) : (
        <p className="mt-4 text-xs text-muted">{t('market.noIssuerYet')}</p>
      )}

      <div className="mt-4 flex flex-col gap-2">
        {pendingOnChain > 0 && !holding.refundedAt && (
          <button
            type="button"
            className="btn btn-primary w-full"
            disabled={busy !== null}
            onClick={() => void actions.receive()}
          >
            <Send className="h-4 w-4" aria-hidden="true" />
            {t('offerings.position.receive')}
          </button>
        )}
        {canClaim && (
          <>
            <button
              type="button"
              className="btn btn-secondary w-full"
              disabled={busy !== null}
              onClick={() => void actions.claim()}
            >
              {t('offerings.position.claim')}
            </button>
            <p className="text-xs text-muted">{t('offerings.position.claimHint')}</p>
          </>
        )}
        {canRefund && (
          <div className="rounded-2xl bg-peach-soft p-4">
            <p className="text-sm font-medium text-ink">{t('offerings.position.refundTitle')}</p>
            <p className="mt-1 text-[13px] text-ink-2">{t('offerings.position.refundBody')}</p>
            <button
              type="button"
              className="btn btn-primary mt-3 w-full"
              disabled={busy !== null}
              onClick={() => void actions.refund()}
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              {busy === 'refund'
                ? t('offerings.position.refunding')
                : t('offerings.position.refund', { u: unit })}
            </button>
          </div>
        )}
        {holding.refundedAt && <Notice tone="good">{t('offerings.position.refunded')}</Notice>}
      </div>
    </Card>
  );
}
