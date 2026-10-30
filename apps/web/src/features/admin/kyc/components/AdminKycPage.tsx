import { useCallback, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import RequireAdmin from '@/components/guards/RequireAdmin';
import { withIsland } from '@/components/island/withIsland';
import AuthenticatedImage from '@/components/ui/AuthenticatedImage';
import { Avatar, EmptyState, Notice, PageHeader, PillTabs, StatusChip } from '@/components/ui/kit';
import type { KycQueueRow } from '@/core/api/AdminApi';
import { container } from '@/core/container';
import { errorMessage } from '@/core/errors';
import { useI18n } from '@/hooks/useI18n';
import { useSession } from '@/hooks/useSession';
import { useVisibleInterval } from '@/hooks/useVisibleInterval';
import { RefreshButton } from '../../shared/RefreshButton';
import { hoursSince, relativeAge } from '../../shared/datetime';
import {
  countByStatus,
  filterRows,
  KYC_FILTERS,
  providerTone,
  slaTone,
  sortForReview,
  STATUS_TONE,
  type KycFilter,
} from '../model';
import { KycDetail, KycDetailEmpty } from './KycDetail';

const { api } = container;

/** Selfie thumbnail for manual rows, initials otherwise. */
function Thumb({ row }: { row: KycQueueRow }) {
  const initials = <Avatar name={row.fullName || row.email} className="h-9 w-9 rounded-xl" />;
  if (!row.selfieUrl || row.verification) return initials;
  return (
    <AuthenticatedImage
      path={row.selfieUrl}
      className="h-9 w-9 shrink-0 rounded-xl object-cover ring-1 ring-line"
      fallback={initials}
    />
  );
}

function VerificationCell({ row }: { row: KycQueueRow }) {
  const { t } = useI18n();
  if (!row.verification) {
    return (
      <StatusChip tone="neutral" icon={false}>
        {t('admin.kyc.manual')}
      </StatusChip>
    );
  }
  return (
    <StatusChip tone={providerTone(row.verification.status)}>
      {t('admin.kyc.didit')} · {t(`admin.kyc.providerStatus.${row.verification.status}`)}
    </StatusChip>
  );
}

function AgeCell({ row, now }: { row: KycQueueRow; now: number }) {
  const { t } = useI18n();
  const hours = hoursSince(row.createdAt, now);
  const tone = slaTone(row.status, hours);
  const text = relativeAge(row.createdAt, now, t);
  if (row.status !== 'PENDING') return <span className="text-xs text-muted">{text}</span>;
  return (
    <StatusChip tone={tone} icon={tone !== 'neutral'}>
      {text}
    </StatusChip>
  );
}

/** Compliance queue: the provider's decision first, then approve / decline / revoke. */
function AdminKyc() {
  const { user } = useSession();
  const sessionId = user?.id ?? null;
  const { t } = useI18n();
  const [rows, setRows] = useState<KycQueueRow[] | null>(null);
  const [filter, setFilter] = useState<KycFilter>('PENDING');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'good' | 'bad'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [now, setNow] = useState(() => Date.now());

  const fetchRows = useCallback(async () => {
    if (!sessionId) return;
    setLoading(true);
    try {
      setRows(await api.admin.kycQueue());
      setLoadError('');
    } catch (err) {
      setLoadError(errorMessage(err, t('admin.common.loadFail')));
    } finally {
      setNow(Date.now());
      setLoading(false);
    }
  }, [sessionId, t]);

  useVisibleInterval(fetchRows, 10_000, Boolean(sessionId), sessionId);

  const counts = useMemo(() => countByStatus(rows ?? []), [rows]);
  const visible = useMemo(() => sortForReview(filterRows(rows ?? [], filter, query)), [rows, filter, query]);
  const selected = visible.find((r) => r.id === selectedId) ?? null;

  const decide = async (row: KycQueueRow, decision: 'APPROVED' | 'REJECTED' | 'REVOKED', reason?: string) => {
    setBusy(true);
    setNotice(null);
    try {
      if (decision === 'APPROVED') await api.admin.approveKyc(row.id);
      else if (decision === 'REJECTED') await api.admin.rejectKyc(row.id, reason ?? '');
      else await api.admin.revokeKyc(row.id, reason ?? '');
      setNotice({ tone: 'good', text: t(`admin.kyc.done.${decision}`, { name: row.fullName || row.id }) });
      await fetchRows();
      return true;
    } catch (err) {
      setNotice({ tone: 'bad', text: errorMessage(err, t('admin.kyc.fail')) });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const detail = selected ? (
    <KycDetail row={selected} now={now} busy={busy} onDecide={decide} />
  ) : (
    <KycDetailEmpty />
  );
  const inlineDetail = selected ? (
    <KycDetail row={selected} now={now} busy={busy} onDecide={decide} showHeader={false} />
  ) : null;

  const empty =
    filter === 'PENDING' && !query ? (
      <EmptyState title={t('admin.kyc.emptyPending')} body={t('admin.kyc.emptyPendingBody')} />
    ) : (
      <EmptyState title={t('admin.kyc.emptyFilter')} />
    );

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('admin.kyc.title')}
        subtitle={t('admin.kyc.lead')}
        actions={<RefreshButton onClick={() => void fetchRows()} busy={loading} />}
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <PillTabs
          label={t('admin.kyc.filters')}
          active={filter}
          onChange={(key) => {
            setFilter(key as KycFilter);
            setSelectedId(null);
          }}
          items={KYC_FILTERS.map((f) => ({
            key: f,
            label: t(`admin.kyc.tabs.${f}`),
            badge: f === 'PENDING' ? counts.PENDING : undefined,
          }))}
        />
        <div className="relative w-full lg:max-w-sm">
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            aria-label={t('admin.kyc.search')}
            placeholder={t('admin.kyc.search')}
            onChange={(e) => setQuery(e.target.value)}
            className="input pl-10"
          />
        </div>
      </div>

      <div aria-live="polite">
        {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
        {loadError && <Notice tone="bad">{loadError}</Notice>}
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_400px] xl:grid-cols-[minmax(0,1fr)_440px]">
        <section className="card min-w-0 overflow-hidden" aria-label={t('admin.kyc.title')}>
          {rows === null ? (
            <p className="p-8 text-center text-sm text-muted">{t('admin.common.loading')}</p>
          ) : visible.length === 0 ? (
            empty
          ) : (
            <>
              {/* Phones: cards; the detail opens under the selected one. */}
              <ul className="divide-y divide-line md:hidden">
                {visible.map((row) => {
                  const open = row.id === selectedId;
                  return (
                    <li key={row.id}>
                      <button
                        type="button"
                        aria-expanded={open}
                        onClick={() => setSelectedId(open ? null : row.id)}
                        className={`flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors ${open ? 'bg-surface-2' : 'hover:bg-surface-2'}`}
                      >
                        <Thumb row={row} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-ink">
                            {row.fullName || '—'}
                          </span>
                          <span className="mt-1 flex flex-wrap items-center gap-1.5">
                            <StatusChip tone={STATUS_TONE[row.status]}>
                              {t(`admin.kyc.status.${row.status}`)}
                            </StatusChip>
                            <AgeCell row={row} now={now} />
                          </span>
                        </span>
                      </button>
                      {open && (
                        <div className="border-t border-line bg-surface px-4 py-5">{inlineDetail}</div>
                      )}
                    </li>
                  );
                })}
              </ul>

              {/* Tablets and up: table; on lg the detail sits in the right column. */}
              <div className="hidden overflow-x-auto md:block">
                <table className="table-clean">
                  <thead>
                    <tr>
                      <th scope="col" className="!pl-5">
                        {t('admin.kyc.colInvestor')}
                      </th>
                      <th scope="col">{t('admin.kyc.colDocument')}</th>
                      <th scope="col">{t('admin.kyc.colVerification')}</th>
                      <th scope="col">{t('admin.kyc.colAge')}</th>
                      <th scope="col" className="!pr-5">
                        {t('admin.kyc.colStatus')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {visible.map((row) => {
                      const on = row.id === selectedId;
                      return [
                        <tr
                          key={row.id}
                          className={`cursor-pointer transition-colors ${on ? 'bg-sky-soft/60' : 'hover:bg-surface-2'}`}
                          onClick={() => setSelectedId(on ? null : row.id)}
                        >
                          <td className="!pl-5">
                            <div className="flex min-w-0 items-center gap-3">
                              <Thumb row={row} />
                              <div className="min-w-0">
                                <button
                                  type="button"
                                  aria-pressed={on}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedId(on ? null : row.id);
                                  }}
                                  className="block max-w-[14rem] truncate rounded text-left text-sm font-medium text-ink hover:underline"
                                >
                                  {row.fullName || '—'}
                                </button>
                                <span className="block max-w-[14rem] truncate text-xs text-muted">
                                  {row.email || row.id}
                                </span>
                              </div>
                            </div>
                          </td>
                          <td className="whitespace-nowrap text-xs">{row.docNumber || '—'}</td>
                          <td>
                            <VerificationCell row={row} />
                          </td>
                          <td className="whitespace-nowrap">
                            <AgeCell row={row} now={now} />
                          </td>
                          <td className="!pr-5">
                            <StatusChip tone={STATUS_TONE[row.status]}>
                              {t(`admin.kyc.status.${row.status}`)}
                            </StatusChip>
                          </td>
                        </tr>,
                        on ? (
                          <tr key={`${row.id}-detail`} className="lg:hidden">
                            <td colSpan={5} className="bg-surface-2 !px-5 !py-5">
                              {inlineDetail}
                            </td>
                          </tr>
                        ) : null,
                      ];
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>

        <aside className="hidden lg:block">
          <div className="card card-pad sticky top-24">{detail}</div>
        </aside>
      </div>
    </div>
  );
}

function AdminKycPage() {
  return (
    <RequireAdmin>
      <AdminKyc />
    </RequireAdmin>
  );
}

export default withIsland(AdminKycPage);
