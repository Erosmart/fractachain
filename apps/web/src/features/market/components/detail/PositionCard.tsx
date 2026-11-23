import { RotateCcw, Send, Stamp } from 'lucide-react';
import ChainSource from '@/components/tx/ChainSource';
import { assetAmount } from '@/components/tx/format';
import TxPanel from '@/components/tx/TxPanel';
import { Card, ChecklistItem, Notice } from '@/components/ui/kit';
import WalletAddress from '@/components/ui/WalletAddress';
import { formatAmount } from '@/core/format/number';
import { useI18n } from '@/hooks/useI18n';
import type { Offering } from '../../hooks/useOffering';

const CARD_ACTIONS = new Set(['refund', 'distribute', 'trustline']);

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
  const trusted = Boolean(user.trustlines?.includes(listing.id));
  const canClaim = success && trusted && (holding?.tokensOwed || 0) > 0 && !refunded;
  // The DEX token is needed only to receive the units once the offering closed well.
  const needsToken = success && Boolean(d.issuerPublicKey) && !trusted && !refunded;
  const num = (n: number) => formatAmount(n, n % 1 ? 2 : 0);

  return (
    <Card title={t('offerings.position.title')}>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-5">
        <div className="min-w-0">
          <dt className="eyebrow">{t('offerings.position.holding')}</dt>
          <dd className="numeral mt-1.5 truncate text-[26px] text-ink">
            {num(units)} <span className="text-sm text-ink-2">{d.tokenTicker}</span>
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="eyebrow">{t('offerings.position.contributed')}</dt>
          <dd className="numeral mt-1.5 truncate text-[26px] text-ink">
            {assetAmount(units * tender.price, code)}
          </dd>
        </div>
      </dl>
      <details className="group mt-3 rounded-xl bg-surface-2 px-3.5 py-2.5 text-xs">
        <summary className="cursor-pointer list-none font-medium text-ink-2 [&::-webkit-details-marker]:hidden">
          {t('offerings.position.where')}
        </summary>
        <dl className="mt-2 space-y-1.5 text-ink-2">
          <div className="flex justify-between gap-3">
            <dt>{t('offerings.position.inContract')}</dt>
            <dd className="text-ink tnum">{num(units)}</dd>
          </div>
          {success && d.issuerPublicKey && (
            <>
              <div className="flex justify-between gap-3">
                <dt>{t('offerings.position.inWallet')}</dt>
                <dd className="text-ink tnum">{num(onChainUnits)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt>{t('offerings.position.toReceive')}</dt>
                <dd className="text-ink tnum">{num(classicPending + Number(holding?.tokensOwed || 0))}</dd>
              </div>
            </>
          )}
        </dl>
        <ChainSource
          className="mt-2"
          contractId={tender.contractId}
          explorer={tender.explorer}
          reads={['get_rwa_balance', 'get_price_per_unit']}
          readAt={tender.readAt}
        />
      </details>

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
        {needsToken && (
          <ChecklistItem
            icon={<Stamp className="h-4 w-4" />}
            title={t('offerings.invest.reqToken', { code: d.tokenTicker })}
            subtitle={t('offerings.invest.reqTokenSub')}
            trailing={
              <button
                type="button"
                className="btn btn-soft btn-sm"
                disabled={flow.busy}
                onClick={() => void actions.approve()}
              >
                {t('offerings.invest.approve')}
              </button>
            }
          />
        )}
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
          <details className="text-xs">
            <summary className="cursor-pointer text-muted underline underline-offset-2">
              {t('offerings.position.claimMore')}
            </summary>
            <button
              type="button"
              className="btn btn-secondary mt-2 w-full"
              disabled={flow.busy}
              onClick={() => void actions.claim()}
            >
              {t('offerings.position.claim')}
            </button>
            <p className="mt-1 text-muted">{t('offerings.position.claimHint')}</p>
          </details>
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
