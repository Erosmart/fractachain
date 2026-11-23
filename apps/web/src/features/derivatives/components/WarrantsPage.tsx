import { useMemo } from 'react';
import { Building } from 'lucide-react';
import { withIsland } from '@/components/island/withIsland';
import ExternalLink from '@/components/ui/ExternalLink';
import { Notice, Stat, StatusChip } from '@/components/ui/kit';
import { container } from '@/core/container';
import { formatAmount } from '@/core/format/number';
import { useI18n } from '@/hooks/useI18n';
import { useChainResource } from '../hooks/useChainResource';
import { shortId, warrantView, type WarrantView } from '../model';
import ChainCard from './chain/ChainCard';
import { ChainEmpty, ChainError, ChainLoading, ChainToolbar } from './chain/ChainStates';
import ComingSoonActions from './chain/ComingSoonActions';
import { AccountLink, AssetAmount, Facts } from './chain/Facts';
import ContractBanner from './ContractBanner';

function WarrantCard({ w }: { w: WarrantView }) {
  const { t, locale } = useI18n();
  const date = (d: Date | null) =>
    d
      ? d.toLocaleDateString(locale === 'en' ? 'en-US' : 'es-AR', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })
      : '—';
  const status =
    w.statusKey === 'unknown'
      ? t('markets.warrants.states.unknown', { raw: w.statusRaw })
      : t(`markets.warrants.states.${w.statusKey}`);
  const terms = w.terms;
  return (
    <ChainCard
      title={t('markets.warrants.instance')}
      subtitle={w.producer ? t('markets.warrants.of', { who: shortId(w.producer, 5, 5) }) : undefined}
      status={<StatusChip tone={w.tone}>{status}</StatusChip>}
      source={w.source}
      actions={
        <ComingSoonActions
          actions={[
            t('markets.warrants.actions.fund'),
            t('markets.warrants.actions.repay'),
            t('markets.warrants.actions.liquidate'),
          ]}
        />
      }
    >
      <div className="mb-5 grid grid-cols-2 gap-4 rounded-2xl bg-sky-soft/50 px-4 py-4">
        <Stat label={t('markets.warrants.loan')} value={formatAmount(w.loanAmount, 2)} unit={w.asset.code} />
        <Stat
          label={t('markets.warrants.ltv')}
          value={terms ? formatAmount(terms.ltvPct, 0) : '—'}
          unit={terms ? '%' : undefined}
        />
      </div>
      <Facts
        items={[
          {
            label: t('markets.warrants.inventory'),
            value: terms ? <AssetAmount value={terms.inventoryValue} code={w.asset.code} /> : '—',
          },
          {
            label: t('markets.warrants.interest'),
            value: terms ? `${formatAmount(terms.interestPct, 2)} %` : '—',
          },
          {
            label: t('markets.warrants.funded'),
            value: terms?.fundedAt ? date(terms.fundedAt) : t('markets.warrants.notFunded'),
          },
          terms?.fundedAt
            ? { label: t('markets.warrants.due'), value: date(terms.dueAt) }
            : { label: t('markets.warrants.offerUntil'), value: date(terms?.offerExpiresAt ?? null) },
          { label: t('markets.warrants.producer'), value: <AccountLink address={w.producer} /> },
          {
            label: t('markets.chain.paymentToken'),
            value: w.asset.explorer ? (
              <ExternalLink
                href={w.asset.explorer}
                className="underline decoration-line-strong underline-offset-2"
              >
                {w.asset.code}
              </ExternalLink>
            ) : (
              w.asset.code
            ),
          },
        ]}
      />
    </ChainCard>
  );
}

/** Warrant-backed loans, read from the deployed `warrant-vault` instances (read-only). */
function WarrantsPage() {
  const { t } = useI18n();
  const res = useChainResource(() => container.api.chain.warrants());
  const views = useMemo(() => (res.data ?? []).map(warrantView), [res.data]);

  return (
    <div className="space-y-5">
      <ContractBanner
        icon={<Building className="h-5 w-5" />}
        title={t('markets.warrants.certTitle')}
        body={t('markets.warrants.certBody')}
        wasm="warrant_vault.wasm"
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
        <ChainEmpty kind={t('markets.warrants.kind')} />
      ) : (
        <>
          {res.error && <Notice tone="warn">{t('markets.chain.stale', { msg: res.error })}</Notice>}
          <div className={`grid grid-cols-1 gap-5 ${views.length > 1 ? 'xl:grid-cols-2' : ''}`}>
            {views.map((w) => (
              <WarrantCard key={w.source.contractId} w={w} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default withIsland(WarrantsPage);
