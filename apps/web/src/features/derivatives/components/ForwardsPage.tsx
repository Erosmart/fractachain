import { useMemo } from 'react';
import { Scale } from 'lucide-react';
import { withIsland } from '@/components/island/withIsland';
import ExternalLink from '@/components/ui/ExternalLink';
import { Notice, StatusChip } from '@/components/ui/kit';
import { container } from '@/core/container';
import { formatAmount } from '@/core/format/number';
import { useI18n } from '@/hooks/useI18n';
import { useChainResource } from '../hooks/useChainResource';
import { forwardView, weight, type ForwardView } from '../model';
import ChainCard from './chain/ChainCard';
import { ChainEmpty, ChainError, ChainLoading, ChainToolbar } from './chain/ChainStates';
import ComingSoonActions from './chain/ComingSoonActions';
import { AccountLink, AssetAmount, Facts } from './chain/Facts';
import ContractBanner from './ContractBanner';

function ForwardCard({ f }: { f: ForwardView }) {
  const { t, locale } = useI18n();
  const w = weight(f.kilos);
  const date = (d: Date | null) =>
    d
      ? d.toLocaleDateString(locale === 'en' ? 'en-US' : 'es-AR', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })
      : '—';
  const state =
    f.stateKey === 'unknown'
      ? t('markets.forwards.states.unknown', { raw: f.stateRaw })
      : t(`markets.forwards.states.${f.stateKey}`);
  const p = f.position;
  return (
    <ChainCard
      title={`${f.crop} · ${formatAmount(w.value, Number.isInteger(w.value) ? 0 : 2)} ${w.unit}`}
      subtitle={t('markets.forwards.instance')}
      status={<StatusChip tone={f.tone}>{state}</StatusChip>}
      source={f.source}
      actions={
        <ComingSoonActions
          actions={[
            t('markets.forwards.actions.deliver'),
            t('markets.forwards.actions.accept'),
            t('markets.forwards.actions.dispute'),
            t('markets.forwards.actions.rollover'),
          ]}
        />
      }
    >
      <Facts
        items={[
          { label: t('markets.forwards.producer'), value: <AccountLink address={f.producer} /> },
          { label: t('markets.forwards.buyer'), value: <AccountLink address={f.buyer} /> },
          { label: t('markets.forwards.arbiter'), value: <AccountLink address={f.arbiter} /> },
          {
            label: t('markets.forwards.escrow'),
            value: p ? <AssetAmount value={p.escrow} code={f.asset.code} /> : '—',
          },
          {
            label: t('markets.forwards.delivery'),
            value: !p
              ? '—'
              : p.delivered
                ? t('markets.forwards.delivered', { date: date(p.deliveredAt) })
                : t('markets.forwards.notDelivered'),
          },
          { label: t('markets.forwards.harvestDeadline'), value: date(p?.harvestDeadline ?? null) },
          {
            label: t('markets.forwards.dispute'),
            value: !p ? '—' : p.disputed ? t('markets.forwards.disputed') : t('markets.forwards.noDispute'),
          },
          {
            label: t('markets.forwards.rollovers'),
            value: p ? t('markets.forwards.rolloversValue', { n: p.rollovers }) : '—',
          },
          {
            label: t('markets.chain.paymentToken'),
            value: f.asset.explorer ? (
              <ExternalLink
                href={f.asset.explorer}
                className="underline decoration-line-strong underline-offset-2"
              >
                {f.asset.code}
              </ExternalLink>
            ) : (
              f.asset.code
            ),
          },
        ]}
      />
    </ChainCard>
  );
}

/** Production forwards, read from the deployed `forward-contract` instances (read-only). */
function ForwardsPage() {
  const { t } = useI18n();
  const res = useChainResource(() => container.api.chain.forwards());
  const views = useMemo(() => (res.data ?? []).map(forwardView), [res.data]);

  return (
    <div className="space-y-5">
      <ContractBanner
        icon={<Scale className="h-5 w-5" />}
        title={t('markets.forwards.legalTitle')}
        body={t('markets.forwards.legalBody')}
        wasm="forward_contract.wasm"
      />
      <ChainToolbar
        count={res.data ? views.length : null}
        updatedAt={res.updatedAt}
        refreshing={res.refreshing}
        failed={Boolean(res.error)}
        onRefresh={res.reload}
      />
      {res.loading ? (
        <ChainLoading />
      ) : res.error && !res.data ? (
        <ChainError message={res.error} onRetry={res.reload} />
      ) : views.length === 0 ? (
        <ChainEmpty kind={t('markets.forwards.kind')} />
      ) : (
        <>
          {res.error && <Notice tone="warn">{t('markets.chain.stale', { msg: res.error })}</Notice>}
          <div className={`grid grid-cols-1 gap-5 ${views.length > 1 ? 'xl:grid-cols-2' : ''}`}>
            {views.map((f) => (
              <ForwardCard key={f.source.contractId} f={f} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default withIsland(ForwardsPage);
