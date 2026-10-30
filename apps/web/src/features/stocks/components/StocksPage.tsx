import { useEffect, useMemo, useState } from 'react';
import { withIsland } from '@/components/island/withIsland';
import { Notice, PillTabs } from '@/components/ui/kit';
import { container } from '@/core/container';
import { useI18n } from '@/hooks/useI18n';
import { useSession } from '@/hooks/useSession';
import {
  ChainEmpty,
  ChainError,
  ChainLoading,
  ChainToolbar,
} from '../../derivatives/components/chain/ChainStates';
import { useChainResource } from '../../derivatives/hooks/useChainResource';
import { stockVaultView } from '../model';
import ReserveProof from './ReserveProof';
import StockVaultCard from './StockVaultCard';

/**
 * Tokenized Merval stocks, read from the deployed `stock-vault` instances.
 * Public and read-only; a signed-in wallet also sees its balance and the
 * dividends it can claim.
 */
function StocksPage() {
  const { t } = useI18n();
  const { user, isLoading } = useSession();
  const holder = user?.publicKey || undefined;
  const res = useChainResource(() => container.api.chain.stocks(holder), holder ?? '');
  const views = useMemo(() => (res.data ?? []).map(stockVaultView), [res.data]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (views.length && !views.some((v) => v.source.contractId === selectedId)) {
      setSelectedId(views[0].source.contractId);
    }
  }, [views, selectedId]);

  const vault = views.find((v) => v.source.contractId === selectedId) ?? views[0] ?? null;

  return (
    <div className="space-y-5">
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
      ) : !vault ? (
        <ChainEmpty kind={t('markets.stocks.kind')} />
      ) : (
        <>
          {res.error && <Notice tone="warn">{t('markets.chain.stale', { msg: res.error })}</Notice>}
          {views.length > 1 && (
            <PillTabs
              label={t('markets.stocks.pick')}
              active={vault.source.contractId}
              onChange={setSelectedId}
              items={views.map((v) => ({ key: v.source.contractId, label: v.ticker }))}
            />
          )}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_400px]">
            <div className="min-w-0">
              <StockVaultCard
                vault={vault}
                signedIn={Boolean(user) || isLoading}
                hasWallet={Boolean(holder)}
              />
            </div>
            <div className="order-first min-w-0 lg:order-none lg:sticky lg:top-24 lg:self-start">
              <ReserveProof vault={vault} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default withIsland(StocksPage);
