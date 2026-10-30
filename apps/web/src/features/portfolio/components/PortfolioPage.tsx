import { useMemo } from 'react';
import { Layers } from 'lucide-react';
import RequireOnboarding from '@/components/guards/RequireOnboarding';
import { withIsland } from '@/components/island/withIsland';
import ExternalLink from '@/components/ui/ExternalLink';
import { Card, EmptyState, Notice, PageHeader, Stat } from '@/components/ui/kit';
import { explorerAccount } from '@/core/format/number';
import { useI18n } from '@/hooks/useI18n';
import { usePortfolio } from '../hooks/usePortfolio';
import { useWalletActivity } from '../hooks/useWalletActivity';
import { describeOperation } from '../model/activity';
import { byAsset, byType } from '../model/allocation';
import { amount, money, signed, signedPct } from '../model/format';
import { dominantSource } from '../model/positions';
import { ActionMessage } from './ActionMessage';
import { ActivityList } from './ActivityList';
import { AllocationBar } from './AllocationBar';
import { HoldingsTable } from './HoldingsTable';
import { IncomeCard } from './IncomeCard';
import { OpenOrdersCard } from './OpenOrdersCard';
import { ProceedsCard } from './ProceedsCard';
import { WalletKeyCard } from './WalletKeyCard';

/** Portfolio: holdings, allocation, income, open orders and on-chain movements. */
function Portfolio() {
  const { t } = useI18n();
  const pf = usePortfolio();
  const { user, book, positions, totals, status } = pf;
  const activity = useWalletActivity(user?.publicKey || undefined);

  const cash = book?.usdcOnChain;
  const source = dominantSource(positions);
  const listingIds = useMemo(() => positions.map((p) => p.listingId), [positions]);
  const typeSegments = byType(totals.marketValue, cash ?? 0, {
    tokens: t('dashboard.portfolio.tokens'),
    cash: t('dashboard.portfolio.usdc'),
  });
  const assetSegments = byAsset(positions, t('dashboard.portfolio.others'));
  const movements = useMemo(
    () =>
      user?.publicKey
        ? activity.ops.slice(0, 8).map((op) => describeOperation(op, user.publicKey, amount))
        : [],
    [activity.ops, user?.publicKey],
  );
  const pnlTone = totals.pnl > 0 ? 'good' : totals.pnl < 0 ? 'bad' : 'neutral';

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('dashboard.portfolio.title')}
        subtitle={t('dashboard.portfolio.subtitle')}
        actions={
          <>
            <a href="/orderbook" className="btn btn-secondary">
              {t('dash.marketCta')}
            </a>
            <a href="/market" className="btn btn-primary">
              <Layers className="h-4 w-4" aria-hidden="true" />
              {t('dashboard.holdings.emptyCta')}
            </a>
          </>
        }
      />

      {status === 'error' && !book && (
        <Notice tone="bad" className="flex flex-wrap items-center justify-between gap-3">
          <span>{t('dashboard.loadError')}</span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => void pf.reload()}>
            {t('dashboard.retry')}
          </button>
        </Notice>
      )}
      <ActionMessage message={pf.message} />

      {/* Summary: one hero figure, the rest as plain stats separated by hairlines. */}
      <section className="card grid grid-cols-2 overflow-hidden lg:grid-cols-5 [&>*]:border-line [&>*]:p-5 sm:[&>*]:p-6">
        <Stat
          className="col-span-2 border-b lg:col-span-1 lg:border-b-0 lg:border-r"
          size="lg"
          label={t('dashboard.portfolio.marketValue')}
          value={money(totals.marketValue)}
          unit="USDC"
          delta={source ?? undefined}
        />
        <Stat
          className="border-b border-r lg:border-b-0"
          label={t('dashboard.portfolio.result')}
          value={signed(totals.pnl)}
          unit="USDC"
          delta={signedPct(totals.pnlPct)}
          deltaTone={pnlTone}
        />
        <Stat
          className="border-b lg:border-b-0 lg:border-r"
          label={t('dashboard.portfolio.cost')}
          value={money(totals.costBasis)}
          unit="USDC"
        />
        <Stat
          className="border-r"
          label={t('dashboard.portfolio.pending')}
          value={money(totals.pendingDividends)}
          unit="USDC"
        />
        <Stat
          label={t('dashboard.portfolio.cash')}
          value={cash === undefined ? '—' : money(cash)}
          unit={cash === undefined ? undefined : 'USDC'}
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-12">
        <Card
          className="lg:col-span-8"
          title={t('dashboard.holdings.title')}
          subtitle={
            positions.length
              ? t('dashboard.holdings.previewSub', {
                  n: positions.length,
                  source: (source ?? '').toLowerCase(),
                })
              : undefined
          }
        >
          {positions.length === 0 ? (
            status === 'loading' ? (
              <p className="py-10 text-center text-sm text-muted">{t('dashboard.loading')}</p>
            ) : (
              <EmptyState
                title={t('dashboard.holdings.empty')}
                action={
                  <a href="/market" className="btn btn-primary">
                    {t('dashboard.holdings.emptyCta')}
                  </a>
                }
              />
            )
          ) : (
            <HoldingsTable positions={positions} tasks={pf.tasks} perform={pf.perform} isBusy={pf.isBusy} />
          )}
        </Card>

        <div className="space-y-6 lg:col-span-4">
          <Card
            title={t('dashboard.portfolio.allocationTitle')}
            subtitle={t('dashboard.portfolio.allocationSub')}
          >
            {typeSegments.length === 0 ? (
              <p className="text-sm text-muted">—</p>
            ) : (
              <div className="space-y-6">
                <AllocationBar title={t('dashboard.portfolio.allocationByType')} segments={typeSegments} />
                {assetSegments.length > 1 && (
                  <AllocationBar
                    title={t('dashboard.portfolio.allocationByAsset')}
                    segments={assetSegments}
                  />
                )}
                <p className="text-xs text-muted">{t('dashboard.portfolio.allocationNote')}</p>
              </div>
            )}
          </Card>
          {user?.publicKey && <WalletKeyCard user={user} fetchSecret={pf.fetchWalletSecret} />}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        <div className="space-y-6 lg:col-span-5">
          <IncomeCard positions={positions} perform={pf.perform} isBusy={pf.isBusy} />
          <OpenOrdersCard listingIds={listingIds} run={pf.run} busy={pf.busy} />
          {book?.proceeds?.length ? (
            <ProceedsCard proceeds={book.proceeds} xlmOnChain={book.xlmOnChain} />
          ) : null}
        </div>
        <Card
          className="lg:col-span-7"
          title={t('dashboard.portfolio.movementsTitle')}
          subtitle={t('dashboard.portfolio.movementsSub')}
          actions={
            user?.publicKey ? (
              <ExternalLink
                href={explorerAccount(user.publicKey)}
                className="text-xs text-ink-2 underline underline-offset-2 hover:text-ink"
              >
                Stellar Expert
              </ExternalLink>
            ) : undefined
          }
        >
          {!user?.publicKey ? (
            <p className="text-sm text-muted">{t('dashboard.activity.noWallet')}</p>
          ) : activity.status === 'loading' ? (
            <p className="py-6 text-center text-sm text-muted">{t('auth.loading')}</p>
          ) : activity.status === 'error' ? (
            <p className="text-sm text-muted">{t('dashboard.activity.unavailable')}</p>
          ) : movements.length === 0 ? (
            <p className="text-sm text-muted">{t('dashboard.activity.empty')}</p>
          ) : (
            <ActivityList items={movements} />
          )}
        </Card>
      </div>
    </div>
  );
}

function PortfolioPage() {
  return (
    <RequireOnboarding>
      <Portfolio />
    </RequireOnboarding>
  );
}

export default withIsland(PortfolioPage);
