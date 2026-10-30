import { RotateCcw, Send } from 'lucide-react';
import ChainSource from '@/components/tx/ChainSource';
import { assetAmount } from '@/components/tx/format';
import TxPanel from '@/components/tx/TxPanel';
import { Card, Notice } from '@/components/ui/kit';
import WalletAddress from '@/components/ui/WalletAddress';
import { formatAmount } from '@/core/format/number';
import { useI18n } from '@/hooks/useI18n';
import type { Offering } from '../../hooks/useOffering';

const CARD_ACTIONS = new Set(['refund', 'distribute']);

/**
 * What the signed-in investor holds in this offering — the units are read
 * from the contract (`get_rwa_balance`) — and what they can do with it.
 */
export default function PositionCard({ offering }: { offering: Offering }) {
  const { t } = useI18n();
  const { listing, user, holding, tender, phase, flow, actions } = offering;
  if (!listing || !user || !tender) return null;
  const d = listing.dossier;
  const units = tender.holder?.rwa ?? 0;
  const code = tender.code;
  const refunded = Boolean(holding?.refundedAt);
  if (units <= 0 && !refunded && !(holding && (holding.tokensOwed || holding.tokens))) return null;

  const success = phase === 'closed' || phase === 'payingIncome';
  const canRefund = tender.stateName === 'Failed' && units > 0;
  const onChainUnits = Number(holding?.tokensOnChain || 0);
  const classicPending = Math.max(0, Number(holding?.tokens || 0) - onChainUnits);
  const canClaim =
    success && Boolean(user.trustlines?.includes(listing.id)) && (holding?.tokensOwed || 0) > 0 && !refunded;

  const stat = (label: string, value: string) => (
    <div className="min-w-0">
      <dt className="eyebrow">{label}</dt>
      <dd className="numeral mt-1.5 truncate text-[26px] text-ink">{value}</dd>
    </div>
  );

  return (
    <Card title={t('offerings.position.title')}>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-5">
        {stat(t('offerings.chain.holderRwa'), formatAmount(units, units % 1 ? 2 : 0))}
        {stat(t('offerings.position.contributed'), assetAmount(units * tender.price, code))}
      </dl>
      <ChainSource
        className="mt-3"
        contractId={tender.contractId}
        explorer={tender.explorer}
        reads={['get_rwa_balance', 'get_price_per_unit']}
        readAt={tender.readAt}
      />

      {success && d.issuerPublicKey ? (
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
      ) : null}

      <div className="mt-4 flex flex-col gap-2">
        {success && classicPending > 0 && !refunded && (
          <button
            type="button"
            className="btn btn-primary w-full"
            disabled={flow.busy}
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
              disabled={flow.busy}
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
              disabled={flow.busy}
              onClick={() => void actions.refund()}
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              {flow.busy && flow.snap.action === 'refund'
                ? t('offerings.position.refunding')
                : t('offerings.position.refund', { u: code })}
            </button>
          </div>
        )}
        {refunded && units <= 0 && <Notice tone="good">{t('offerings.position.refunded')}</Notice>}
        {flow.snap.action && CARD_ACTIONS.has(flow.snap.action) && (
          <TxPanel
            snap={flow.snap}
            onSign={() => void flow.sign()}
            onRetry={() => void flow.retry()}
            onResign={() => flow.resign()}
            onClose={() => flow.reset()}
          />
        )}
      </div>
    </Card>
  );
}
