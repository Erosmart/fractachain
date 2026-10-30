import { useMemo } from 'react';
import RequireOnboarding from '@/components/guards/RequireOnboarding';
import { withIsland } from '@/components/island/withIsland';
import { Card, EmptyState, Greeting, Notice, WireframeAsset } from '@/components/ui/kit';
import { formatAmount } from '@/core/format/number';
import { useI18n } from '@/hooks/useI18n';
import { ActionMessage } from '@/features/portfolio/components/ActionMessage';
import { ActivityList } from '@/features/portfolio/components/ActivityList';
import { HoldingsTable } from '@/features/portfolio/components/HoldingsTable';
import { useIsNarrow, useLedger, useListing, usePools } from '@/features/portfolio/hooks/useMarketContext';
import { usePortfolio } from '@/features/portfolio/hooks/usePortfolio';
import { useWalletActivity } from '@/features/portfolio/hooks/useWalletActivity';
import { describeOperation } from '@/features/portfolio/model/activity';
import { amount, clock } from '@/features/portfolio/model/format';
import { dominantSource, offeringDay } from '@/features/portfolio/model/positions';
import { pendingCount } from '@/features/portfolio/model/tasks';
import { ActivityChart } from './ActivityChart';
import { CapitalPanel, type NextStep } from './CapitalPanel';
import { OfferingsCard } from './OfferingsCard';
import { TaskList } from './TaskList';

/**
 * Inicio — the investor's day at a glance, laid out like the reference:
 * greeting + illustration, check-in rows, two data cards, and the gradient
 * panel on the right (a strip under the greeting on phones).
 */
function Home() {
  const { t, locale } = useI18n();
  const pf = usePortfolio();
  const { user, book, positions, totals, tasks, loadedAt, status } = pf;
  const pools = usePools();
  const ledger = useLedger();
  const narrow = useIsNarrow();
  const activity = useWalletActivity(user?.publicKey || undefined);

  // An open offering the investor is in: "Día 12 de 30 de la licitación X".
  const live = useMemo(() => {
    const mine = new Set(positions.map((p) => p.listingId));
    return (pools ?? []).find((p) => p.status === 'OPEN' && mine.has(p.id));
  }, [pools, positions]);
  const liveListing = useListing(live?.id);
  const day = liveListing ? offeringDay(liveListing.listedAt, liveListing.dossier?.offeringDays) : null;

  const pending = pendingCount(tasks);
  const statusLine = [
    day && live
      ? t('dashboard.status.offeringDay', { day: day.day, total: day.total, ticker: live.tokenTicker ?? '' })
      : null,
    pending === 0
      ? t('dashboard.status.allSet')
      : pending === 1
        ? t('dashboard.status.pendingOne')
        : t('dashboard.status.pendingMany', { n: pending }),
    !day
      ? positions.length === 0
        ? t('dashboard.status.noAssets')
        : positions.length === 1
          ? t('dashboard.status.assetsOne')
          : t('dashboard.status.assetsMany', { n: positions.length })
      : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const firstPending = tasks.find((task) => !task.done);
  const next: NextStep = firstPending
    ? {
        label: t('dashboard.panel.nextTask', { task: taskLabel(firstPending.kind, firstPending.ticker, t) }),
        href: firstPending.href ?? '#pendientes',
      }
    : { label: t('dashboard.panel.nextExplore'), href: '/market' };

  const recent = useMemo(
    () =>
      user?.publicKey
        ? activity.ops.slice(0, 5).map((op) => describeOperation(op, user.publicKey, amount))
        : [],
    [activity.ops, user?.publicKey],
  );
  const source = dominantSource(positions);

  if (!user) return null;

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-12">
        {/* Greeting + illustration */}
        <section className="relative min-h-[150px] lg:col-span-8 lg:col-start-1 lg:min-h-[300px]">
          <Greeting name={user.legalName || user.name}>{statusLine}</Greeting>
          <WireframeAsset className="pointer-events-none absolute right-0 top-6 hidden h-[250px] w-[58%] max-w-[560px] sm:block lg:top-2 lg:h-[290px]" />
          <div className="mt-4 flex flex-wrap gap-2 lg:absolute lg:bottom-1 lg:left-0">
            {loadedAt && (
              <span className="chip border border-line bg-surface text-ink shadow-card">
                <span className="h-1.5 w-1.5 rounded-full bg-good" aria-hidden="true" />
                {t('dashboard.chips.updated', { time: clock(loadedAt, locale) })}
              </span>
            )}
            {ledger && (
              <span className="chip border border-line bg-surface text-ink shadow-card tnum">
                {t('dashboard.chips.ledger', {
                  network: ledger.network,
                  ledger: formatAmount(ledger.ledger),
                })}
              </span>
            )}
          </div>
        </section>

        <CapitalPanel
          className="lg:col-span-4 lg:col-start-9 lg:row-span-3 lg:row-start-1"
          book={book}
          positions={positions}
          totals={totals}
          loadedAt={loadedAt}
          next={next}
        />

        <div className="space-y-3 lg:col-span-8 lg:col-start-1">
          {status === 'error' && !book && (
            <Notice tone="bad" className="flex flex-wrap items-center justify-between gap-3">
              <span>{t('dashboard.loadError')}</span>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => void pf.reload()}>
                {t('dashboard.retry')}
              </button>
            </Notice>
          )}
          <ActionMessage message={pf.message} />
          <TaskList tasks={tasks} user={user} perform={pf.perform} isBusy={pf.isBusy} />
        </div>

        <div className="grid gap-5 md:grid-cols-5 lg:col-span-8 lg:col-start-1">
          <ActivityChart
            className="md:col-span-3"
            publicKey={user.publicKey || undefined}
            ops={activity.ops}
            status={activity.status}
            days={narrow ? 14 : 30}
          />
          <OfferingsCard className="md:col-span-2" pools={pools} positions={positions} />
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-12">
        <Card
          className="lg:col-span-7"
          title={t('dashboard.holdings.title')}
          subtitle={
            positions.length
              ? t('dashboard.holdings.previewSub', {
                  n: positions.length,
                  source: (source ?? '').toLowerCase(),
                })
              : undefined
          }
          href="/portfolio"
          hrefLabel={t('dashboard.holdings.viewAll')}
        >
          {positions.length === 0 ? (
            status === 'loading' ? (
              <p className="py-8 text-center text-sm text-muted">{t('dashboard.loading')}</p>
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
            <HoldingsTable positions={positions.slice(0, 5)} variant="preview" />
          )}
        </Card>
        <Card
          className="lg:col-span-5"
          title={t('dashboard.activity.recentTitle')}
          subtitle={t('dashboard.activity.recentSub')}
          href="/portfolio"
          hrefLabel={t('dashboard.portfolio.movementsTitle')}
        >
          {!user.publicKey ? (
            <p className="text-sm text-muted">{t('dashboard.activity.noWallet')}</p>
          ) : activity.status === 'loading' ? (
            <p className="py-6 text-center text-sm text-muted">{t('auth.loading')}</p>
          ) : activity.status === 'error' ? (
            <p className="text-sm text-muted">{t('dashboard.activity.unavailable')}</p>
          ) : recent.length === 0 ? (
            <p className="text-sm text-muted">{t('dashboard.activity.empty')}</p>
          ) : (
            <ActivityList items={recent} />
          )}
        </Card>
      </div>
    </div>
  );
}

/** Short task name for the panel's "Siguiente: …" note. */
function taskLabel(
  kind: string,
  ticker: string | undefined,
  t: (k: string, v?: Record<string, string | number>) => string,
) {
  const key: Record<string, string> = {
    email: 'dashboard.tasks.email',
    wallet: 'dashboard.tasks.wallet',
    kyc: 'dashboard.tasks.kyc',
    usdc: 'dashboard.tasks.usdc',
    twoFa: 'dashboard.tasks.twoFa',
    trustline: 'dashboard.tasks.trustline',
    claim: 'dashboard.tasks.claim',
    receive: 'dashboard.tasks.receive',
    refund: 'dashboard.tasks.refund',
    dividend: 'dashboard.tasks.dividend',
  };
  const label = t(key[kind] ?? 'dashboard.tasks.title', { ticker: ticker ?? '' });
  return label.charAt(0).toLowerCase() + label.slice(1);
}

function HomePage() {
  return (
    <RequireOnboarding>
      <Home />
    </RequireOnboarding>
  );
}

export default withIsland(HomePage);
