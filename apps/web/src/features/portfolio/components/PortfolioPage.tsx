import { useMemo } from 'react';
import { Layers } from 'lucide-react';
import RequireOnboarding from '@/components/guards/RequireOnboarding';
import { withIsland } from '@/components/island/withIsland';
import { assetAmount } from '@/components/tx/format';
import TxPanel from '@/components/tx/TxPanel';
import ExternalLink from '@/components/ui/ExternalLink';
import { Card, EmptyState, Notice, PageHeader, Stat } from '@/components/ui/kit';
import { explorerAccount } from '@/core/format/number';
import { useI18n } from '@/hooks/useI18n';
import { usePortfolio } from '../hooks/usePortfolio';
import { useWalletActivity } from '../hooks/useWalletActivity';
import { describeOperation } from '../model/activity';
import { byAsset, byType } from '../model/allocation';
import { amount, clock } from '../model/format';
import { ActivityList } from './ActivityList';
import { AllocationBar } from './AllocationBar';
import { HoldingsTable } from './HoldingsTable';
import { ProceedsCard } from './ProceedsCard';
import { WalletKeyCard } from './WalletKeyCard';

/**
 * Portfolio (Instaward 1, D3): balances and holdings read from Stellar —
 * XLM and USDC from the account, units from each tender contract — with the
 * contract id of every holding. No sandbox balances.
 */
function Portfolio() {
  const { t, locale } = useI18n();
  const pf = usePortfolio();
  const { user, book, wallet, holdings, byCode, tokensValue, usdcCode, status, loadedAt, flow } = pf;
  const activity = useWalletActivity(user?.publicKey || undefined);

  const usdc = wallet?.usdc ?? null;
  const others = byCode.filter((v) => v.code !== usdcCode);
  const typeSegments = byType(tokensValue, usdc?.balance ?? 0, {
    tokens: t('dashboard.portfolio.tokens'),
    cash: t('dashboard.chain.usdc', { code: usdcCode }),
  });
  const assetSegments = byAsset(holdings, t('dashboard.portfolio.others'), usdcCode);
  const movements = useMemo(
    () =>
      user?.publicKey
        ? activity.ops.slice(0, 8).map((op) => describeOperation(op, user.publicKey, amount))
        : [],
    [activity.ops, user?.publicKey],
  );
  const readLine = loadedAt
    ? t('dashboard.chain.sourceAt', { time: clock(loadedAt, locale) })
    : t('dashboard.chain.source');

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

      {status === 'noWallet' && <Notice tone="sky">{t('dashboard.chain.noWallet')}</Notice>}
      {status === 'error' && (
        <Notice tone="bad" className="flex flex-wrap items-center justify-between gap-3">
          <span>
            <span className="font-medium">{t('dashboard.chain.error')}</span> {t('dashboard.chain.errorBody')}
          </span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => void pf.reload()}>
            {t('dashboard.retry')}
          </button>
        </Notice>
      )}
      <TxPanel
        snap={flow.snap}
        onSign={() => void flow.sign()}
        onRetry={() => void flow.retry()}
        onResign={() => flow.resign()}
        onClose={() => flow.reset()}
      />

      {/* Summary: one hero figure, the rest as plain stats separated by hairlines. */}
      <section className="card overflow-hidden" aria-label={t('dashboard.portfolio.title')}>
        <div className="grid grid-cols-2 lg:grid-cols-4 [&>*]:border-line [&>*]:p-5 sm:[&>*]:p-6">
          <Stat
            className="col-span-2 border-b lg:col-span-1 lg:border-b-0 lg:border-r"
            size="lg"
            label={t('dashboard.chain.tokensValue')}
            value={wallet ? amount(tokensValue) : '—'}
            unit={wallet ? usdcCode : undefined}
            delta={
              others.length
                ? t('dashboard.chain.otherAssets', {
                    list: others.map((o) => assetAmount(o.value, o.code)).join(' · '),
                  })
                : t('dashboard.chain.tokensValueNote')
            }
          />
          <Stat
            className="border-b border-r lg:border-b-0"
            label={t('dashboard.chain.usdc', { code: usdcCode })}
            value={usdc ? amount(usdc.balance) : '—'}
            unit={usdc ? usdcCode : undefined}
            delta={usdc && !usdc.trustline ? t('dashboard.chain.usdcNoTrust', { code: usdcCode }) : undefined}
          />
          <Stat
            className="border-b lg:border-b-0 lg:border-r"
            label={t('dashboard.chain.xlm')}
            value={wallet ? amount(wallet.xlm) : '—'}
            unit={wallet ? 'XLM' : undefined}
            delta={t('dashboard.chain.xlmNote')}
          />
          <Stat
            label={t('dashboard.chain.positions')}
            value={wallet ? String(holdings.length) : '—'}
            delta={t('dashboard.chain.positionsNote')}
          />
        </div>
        {wallet && (
          <p className="border-t border-line px-5 py-2.5 text-[11px] text-ink-2 sm:px-6">
            {readLine} ·{' '}
            <ExternalLink
              href={explorerAccount(wallet.address)}
              className="font-mono underline-offset-2 hover:text-ink hover:underline"
            >
              {wallet.address.slice(0, 5)}…{wallet.address.slice(-5)}
            </ExternalLink>
          </p>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-12">
        <Card
          className="lg:col-span-8"
          title={t('dashboard.holdings.title')}
          subtitle={holdings.length ? readLine : undefined}
        >
          {holdings.length === 0 ? (
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
            <HoldingsTable holdings={holdings} tasks={pf.tasks} perform={pf.perform} isBusy={pf.isBusy} />
          )}
          {others.length > 0 && (
            <p className="mt-3 text-xs text-muted">{t('dashboard.chain.xlmNotSummed')}</p>
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
        {book?.proceeds?.length ? (
          <div className="space-y-6 lg:col-span-5">
            <ProceedsCard proceeds={book.proceeds} xlmOnChain={wallet?.xlm} />
          </div>
        ) : null}
        <Card
          className={book?.proceeds?.length ? 'lg:col-span-7' : 'lg:col-span-12'}
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
