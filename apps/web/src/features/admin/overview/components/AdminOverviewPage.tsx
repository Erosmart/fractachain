import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, CalendarClock, Landmark, LifeBuoy, ServerCrash, UserCheck, Wallet } from 'lucide-react';
import type { Listing, SupportMessage } from '@fractachain/shared';
import RequireAdmin from '@/components/guards/RequireAdmin';
import { withIsland } from '@/components/island/withIsland';
import {
  Card,
  ChecklistItem,
  Gauge,
  GradientPanel,
  PageHeader,
  PanelNote,
  Stat,
  StatGrid,
  StatusChip,
} from '@/components/ui/kit';
import type { KycQueueRow, NetworkStatus } from '@/core/api/AdminApi';
import type { AuditEntry } from '@/core/api/types';
import { container } from '@/core/container';
import { formatAmount, formatInt } from '@/core/format/number';
import { useI18n } from '@/hooks/useI18n';
import { useSession } from '@/hooks/useSession';
import { actorLabel } from '../../audit/model';
import { ISSUANCE_STAGES, STAGE_TONE } from '../../issuance/model';
import { RefreshButton } from '../../shared/RefreshButton';
import { relativeAge, relativeUntil } from '../../shared/datetime';
import { percentOfCap, summarize } from '../model';

const { api } = container;

/** Alerts closer than this many days count as "closing soon". */
const CLOSING_SOON_DAYS = 7;

interface OverviewData {
  listings: Listing[] | null;
  kyc: KycQueueRow[] | null;
  paying: Set<string>;
  network: NetworkStatus | null;
  activity: AuditEntry[] | null;
  /** Open support messages (null until loaded or when the endpoint is unavailable). */
  support: SupportMessage[] | null;
}

function AdminOverview() {
  const { user } = useSession();
  const sessionId = user?.id ?? null;
  const { t, locale } = useI18n();
  const [data, setData] = useState<OverviewData>({
    listings: null,
    kyc: null,
    paying: new Set(),
    network: null,
    activity: null,
    support: null,
  });
  const [loading, setLoading] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    if (!sessionId) return;
    setLoading(true);
    const patch = (p: Partial<OverviewData>) => setData((d) => ({ ...d, ...p }));
    // Each source lands on its own: a slow RPC never holds the queue back.
    await Promise.allSettled([
      api.admin.listings().then(async (listings) => {
        patch({ listings });
        const closed = listings.filter((l) => l.status === 'CLOSED_SUCCESS');
        const paid = await Promise.all(
          closed.map((l) =>
            api.admin
              .dividends(l.id)
              .then((d) => (d.length ? l.id : null))
              .catch(() => null),
          ),
        );
        patch({ paying: new Set(paid.filter((id): id is string => Boolean(id))) });
      }),
      api.admin.kycQueue().then((kyc) => patch({ kyc })),
      api.admin.networkStatus().then((network) => patch({ network })),
      api.admin.audit({ limit: 6 }).then((activity) => patch({ activity })),
      api.admin.supportMessages('open').then((support) => patch({ support })),
    ]);
    setNow(Date.now());
    setLoading(false);
  }, [sessionId]);

  useEffect(() => {
    void load();
  }, [load]);

  const summary = useMemo(
    () => summarize(data.listings ?? [], data.kyc ?? [], data.paying),
    [data.listings, data.kyc, data.paying],
  );
  const usdc = (n: number) => `${formatAmount(n, n % 1 ? 2 : 0)} USDC`;
  const xlm = (n: number) => `${formatAmount(n, 0)} XLM`;
  const ready = data.listings !== null && data.kyc !== null;

  /* ----------------------------- alerts ----------------------------- */
  const oldest = summary.pendingKyc[0];
  const soon = summary.closings.filter((c) => c.at.getTime() - now < CLOSING_SOON_DAYS * 86_400_000);
  const alerts = [
    ...(summary.pendingKyc.length
      ? [
          {
            key: 'kyc',
            icon: <UserCheck className="h-4 w-4" aria-hidden="true" />,
            title:
              summary.pendingKyc.length === 1
                ? t('admin.overview.kycWaitingOne')
                : t('admin.overview.kycWaiting', { n: summary.pendingKyc.length }),
            subtitle: t('admin.overview.oldest', { age: relativeAge(oldest?.createdAt, now, t) }),
            href: '/admin/kyc',
          },
        ]
      : []),
    ...(data.support?.length
      ? [
          {
            key: 'support',
            icon: <LifeBuoy className="h-4 w-4" aria-hidden="true" />,
            title:
              data.support.length === 1
                ? t('admin.support.pendingTitleOne')
                : t('admin.support.pendingTitle', { n: data.support.length }),
            subtitle: t('admin.support.pendingSub', {
              age: relativeAge(
                [...data.support].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0]?.createdAt,
                now,
                t,
              ),
            }),
            href: '/admin/support',
          },
        ]
      : []),
    ...soon.map(({ listing, at }) => ({
      key: `close-${listing.id}`,
      icon: <CalendarClock className="h-4 w-4" aria-hidden="true" />,
      title: t('admin.overview.closing', {
        name: listing.dossier.tokenTicker || listing.dossier.legalName,
        when: relativeUntil(at, now, t),
      }),
      subtitle: t('admin.overview.closingSub', {
        raised: (listing.dossier.paymentKind === 'XLM' ? xlm : usdc)(listing.raisedUsdc),
        cap: (listing.dossier.paymentKind === 'XLM' ? xlm : usdc)(listing.dossier.offeringHardCapUsdc),
      }),
      href: `/admin/issuance#listing-${listing.id}`,
    })),
    ...summary.missingWallet.map((listing) => ({
      key: `wallet-${listing.id}`,
      icon: <Wallet className="h-4 w-4" aria-hidden="true" />,
      title: t('admin.overview.noWallet', { name: listing.dossier.tokenTicker || listing.dossier.legalName }),
      subtitle: t('admin.overview.noWalletSub'),
      href: `/admin/issuance#listing-${listing.id}`,
    })),
    ...(data.network && !data.network.rpcOk
      ? [
          {
            key: 'rpc',
            icon: <ServerCrash className="h-4 w-4" aria-hidden="true" />,
            title: t('admin.overview.rpcDown'),
            subtitle: t('admin.overview.rpcDownSub'),
            href: '/admin/testnet',
          },
        ]
      : []),
  ];

  /* --------------------------- right panel -------------------------- */
  const open =
    summary.openUsdc.count > 0 ? summary.openUsdc : summary.openXlm.count > 0 ? summary.openXlm : null;
  const openFmt = open === summary.openXlm ? xlm : usdc;
  const pct = open ? percentOfCap(open) : 0;
  const next = summary.closings[0];

  const sections = [
    {
      key: 'issuance',
      href: '/admin/issuance',
      datum: t('admin.issuance.listingsSub', { n: summary.total }),
    },
    {
      key: 'kyc',
      href: '/admin/kyc',
      datum: summary.pendingKyc.length
        ? `${summary.pendingKyc.length} ${t('admin.kyc.tabs.PENDING').toLowerCase()}`
        : t('admin.overview.kycQueueEmpty'),
    },
    { key: 'opa', href: '/admin/opa', datum: t('admin.opa.simulation') },
    {
      key: 'testnet',
      href: '/admin/testnet',
      datum: data.network
        ? data.network.rpcOk
          ? t('admin.overview.rpcOk')
          : t('admin.overview.rpcKo')
        : '—',
    },
    {
      key: 'audit',
      href: '/admin/audit',
      datum: data.activity?.[0]
        ? t('admin.overview.lastEvent', { age: relativeAge(data.activity[0].at, now, t) })
        : '—',
    },
  ] as const;
  const sectionText: Record<(typeof sections)[number]['key'], string> = {
    issuance: t('admin.overview.sectionIssuance'),
    kyc: t('admin.overview.sectionKyc'),
    opa: t('admin.overview.sectionOpa'),
    testnet: t('admin.overview.sectionTestnet'),
    audit: t('admin.overview.sectionAudit'),
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('admin.overview.title')}
        subtitle={t('admin.overview.lead')}
        actions={<RefreshButton onClick={() => void load()} busy={loading} />}
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-6">
          <Card title={t('admin.overview.alerts')} subtitle={t('admin.overview.alertsSub')}>
            <div className="space-y-2" aria-live="polite">
              {!ready ? (
                <p className="text-sm text-muted">{t('admin.common.loading')}</p>
              ) : alerts.length === 0 ? (
                <ChecklistItem
                  done
                  title={t('admin.overview.allClear')}
                  subtitle={t('admin.overview.allClearSub')}
                />
              ) : (
                alerts.map((a) => (
                  <ChecklistItem
                    key={a.key}
                    icon={a.icon}
                    title={a.title}
                    subtitle={a.subtitle}
                    href={a.href}
                  />
                ))
              )}
            </div>
          </Card>

          <section className="card min-w-0 overflow-hidden" aria-labelledby="kpi-title">
            <header className="px-5 pt-5 sm:px-6 sm:pt-6">
              <h2 id="kpi-title" className="title">
                {t('admin.overview.kpis')}
              </h2>
              <p className="subtitle mt-0.5">{t('admin.overview.kpisSub')}</p>
            </header>
            <StatGrid className="mt-2">
              <Stat
                label={t('admin.overview.openNow')}
                value={ready ? formatInt(summary.openUsdc.count + summary.openXlm.count) : '—'}
                unit={t('admin.overview.openNowUnit')}
              />
              <Stat
                label={t('admin.overview.kycQueue')}
                value={ready ? formatInt(summary.pendingKyc.length) : '—'}
                delta={
                  ready
                    ? oldest
                      ? t('admin.overview.kycQueueNote', { age: relativeAge(oldest.createdAt, now, t) })
                      : t('admin.overview.kycQueueEmpty')
                    : undefined
                }
              />
              <Stat
                label={t('admin.overview.raisedOpen')}
                value={ready ? formatAmount(summary.openUsdc.raised, 0) : '—'}
                unit="USDC"
                delta={summary.openXlm.count ? `+ ${xlm(summary.openXlm.raised)}` : undefined}
              />
              <Stat
                label={t('admin.overview.nextClose')}
                value={next ? relativeUntil(next.at, now, t) : '—'}
                delta={
                  next
                    ? next.listing.dossier.tokenTicker || next.listing.dossier.legalName
                    : ready
                      ? t('admin.overview.nextCloseNone')
                      : undefined
                }
              />
            </StatGrid>
          </section>

          <Card
            title={t('admin.overview.stages')}
            subtitle={t('admin.overview.stagesSub', { n: summary.total })}
            href="/admin/issuance"
            hrefLabel={t('admin.nav.issuance')}
          >
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {ISSUANCE_STAGES.map((stage) => (
                <li key={stage} className="rounded-2xl bg-surface-2 px-4 py-3">
                  <p className="numeral text-[34px] text-ink">{ready ? summary.stageCounts[stage] : '—'}</p>
                  <StatusChip tone={STAGE_TONE[stage]} icon={false} className="mt-2">
                    {t(`admin.issuance.stage.${stage}`)}
                  </StatusChip>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <GradientPanel
          className="order-first lg:order-none"
          title={open ? t('admin.overview.panelTitle') : t('admin.overview.panelEmptyTitle')}
          subtitle={open ? t('admin.overview.panelSub') : t('admin.overview.panelEmptySub')}
          href="/admin/issuance"
          hrefLabel={t('admin.nav.issuance')}
          footer={
            <PanelNote icon={<Activity className="h-4 w-4" aria-hidden="true" />} href="/admin/testnet">
              {data.network
                ? `${data.network.ledger ? t('admin.overview.ledger', { n: formatInt(data.network.ledger) }) : data.network.network} · ${
                    data.network.rpcOk ? t('admin.overview.rpcOk') : t('admin.overview.rpcKo')
                  }`
                : t('admin.common.loading')}
            </PanelNote>
          }
        >
          <div className="px-5 pt-4 sm:px-6">
            {open ? (
              <Gauge
                value={pct}
                max={100}
                display={`${pct}%`}
                caption={`${openFmt(open.raised)} ${t('shell.kit.of')} ${openFmt(open.cap)}`}
                minLabel="0"
                maxLabel={openFmt(open.cap)}
                ariaLabel={t('admin.overview.gaugeAria', { pct })}
              />
            ) : (
              <div className="py-8">
                <p className="flex items-baseline gap-2 text-ink">
                  <span className="numeral text-[56px] sm:text-[64px]">
                    {ready ? formatAmount(summary.closedUsdc.raised, 0) : '—'}
                  </span>
                  <span className="text-sm text-ink-2">USDC</span>
                </p>
                {summary.closedXlm.raised > 0 && (
                  <p className="mt-2 text-sm text-ink-2">+ {xlm(summary.closedXlm.raised)}</p>
                )}
              </div>
            )}
          </div>
          <StatGrid className="mt-2 [&>*]:!border-ink/10">
            <Stat
              label={t('admin.overview.closedOk')}
              value={ready ? summary.closedUsdc.count + summary.closedXlm.count : '—'}
            />
            <Stat label={t('admin.overview.closedFail')} value={ready ? summary.stageCounts.failed : '—'} />
            <Stat
              label={t('admin.overview.approvedInvestors')}
              value={ready ? summary.approvedInvestors : '—'}
            />
            <Stat label={t('admin.issuance.stage.paying')} value={ready ? summary.stageCounts.paying : '—'} />
          </StatGrid>
        </GradientPanel>
      </div>

      <section aria-labelledby="sections-title" className="space-y-3">
        <h2 id="sections-title" className="title">
          {t('admin.overview.sections')}
        </h2>
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {sections.map((s) => (
            <li key={s.key}>
              <Card
                as="article"
                title={t(`admin.nav.${s.key}`)}
                subtitle={sectionText[s.key]}
                href={s.href}
                hrefLabel={t(`admin.nav.${s.key}`)}
                className="h-full"
              >
                <StatusChip tone="neutral" icon={false}>
                  {s.datum}
                </StatusChip>
              </Card>
            </li>
          ))}
        </ul>
      </section>

      <Card
        title={t('admin.overview.activity')}
        subtitle={t('admin.overview.activitySub')}
        href="/admin/audit"
        hrefLabel={t('admin.nav.audit')}
      >
        {data.activity === null ? (
          <p className="text-sm text-muted">{t('admin.common.loading')}</p>
        ) : data.activity.length === 0 ? (
          <p className="text-sm text-muted">{t('admin.overview.activityEmpty')}</p>
        ) : (
          <ul className="divide-y divide-line">
            {data.activity.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5">
                <div className="flex min-w-0 items-center gap-3">
                  <Landmark className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
                  <span className="truncate font-mono text-xs text-ink">{e.action}</span>
                  <span className="truncate text-xs text-muted">{actorLabel(e, t('admAudit.system'))}</span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span
                    className="text-xs text-muted"
                    title={new Date(e.at).toLocaleString(locale === 'en' ? 'en-US' : 'es-AR')}
                  >
                    {relativeAge(e.at, now, t)}
                  </span>
                  <StatusChip tone={e.outcome === 'success' ? 'good' : 'bad'}>
                    {e.outcome === 'success' ? t('admAudit.success') : t('admAudit.failure')}
                  </StatusChip>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function AdminOverviewPage() {
  return (
    <RequireAdmin>
      <AdminOverview />
    </RequireAdmin>
  );
}

export default withIsland(AdminOverviewPage);
