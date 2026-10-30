import { useCallback, useEffect, useMemo, useState, type SubmitEvent } from 'react';
import { Download, Search } from 'lucide-react';
import RequireAdmin from '@/components/guards/RequireAdmin';
import { withIsland } from '@/components/island/withIsland';
import { EmptyState, Notice, PageHeader, PillTabs, StatusChip } from '@/components/ui/kit';
import type { AuditEntry } from '@/core/api/types';
import { container } from '@/core/container';
import { errorMessage } from '@/core/errors';
import { useI18n } from '@/hooks/useI18n';
import { useSession } from '@/hooks/useSession';
import { CopyValue } from '../../shared/CopyValue';
import { RefreshButton } from '../../shared/RefreshButton';
import { auditToCsv, downloadText } from '../csv';
import { actorLabel, detailsText, formatAuditTime } from '../model';

const { api } = container;

/** Quick action prefixes (the API filters by prefix). */
const PREFIXES = ['', 'auth.', 'kyc.', 'listing.', 'offering.', 'testnet.', 'compliance.'] as const;
type OutcomeFilter = 'all' | 'success' | 'failure';

function Outcome({ entry }: { entry: AuditEntry }) {
  const { t } = useI18n();
  const ok = entry.outcome === 'success';
  return (
    <StatusChip tone={ok ? 'good' : 'bad'}>{ok ? t('admAudit.success') : t('admAudit.failure')}</StatusChip>
  );
}

function Details({ entry }: { entry: AuditEntry }) {
  const { t } = useI18n();
  const text = detailsText(entry);
  if (!text) return null;
  return (
    <details className="mt-1.5">
      <summary className="cursor-pointer text-xs text-muted hover:text-ink">{t('admAudit.details')}</summary>
      <pre className="mt-1.5 max-w-md whitespace-pre-wrap break-all rounded-lg bg-surface-2 p-2.5 font-mono text-[11px] text-ink-2">
        {text}
      </pre>
    </details>
  );
}

/** Admin audit trail: who did what, when, from where, and whether it worked. */
function AdminAudit() {
  const { user } = useSession();
  const { t, locale } = useI18n();
  const sessionId = user?.id ?? null;
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [action, setAction] = useState('');
  const [actor, setActor] = useState('');
  const [query, setQuery] = useState({ action: '', actor: '' });
  const [outcome, setOutcome] = useState<OutcomeFilter>('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!sessionId) return;
    setLoading(true);
    setError('');
    try {
      setEntries(await api.admin.audit({ limit: 200, action: query.action, actor: query.actor }));
    } catch (err) {
      setError(errorMessage(err, t('admAudit.loadFail')));
    } finally {
      setLoading(false);
    }
  }, [sessionId, query, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(
    () => (entries ?? []).filter((e) => outcome === 'all' || e.outcome === outcome),
    [entries, outcome],
  );

  const applyFilters = (e: SubmitEvent) => {
    e.preventDefault();
    setQuery({ action, actor });
  };

  const pickPrefix = (prefix: string) => {
    setAction(prefix);
    setQuery((q) => ({ ...q, action: prefix }));
  };

  const exportCsv = () => {
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    downloadText(`fractachain-auditoria-${stamp}.csv`, auditToCsv(visible));
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('admin.audit.title')}
        subtitle={t('admin.audit.lead')}
        actions={
          <>
            <RefreshButton onClick={() => void load()} busy={loading} />
            <button type="button" className="btn btn-primary" onClick={exportCsv} disabled={!visible.length}>
              <Download className="h-4 w-4" aria-hidden="true" />
              {t('admin.audit.exportCsv')}
            </button>
          </>
        }
      />

      {/* One filter row above everything it scopes. */}
      <form onSubmit={applyFilters} className="card card-pad space-y-4">
        <PillTabs
          label={t('admin.audit.prefixes')}
          active={query.action}
          onChange={pickPrefix}
          items={PREFIXES.map((p) => ({
            key: p,
            label: p ? <span className="font-mono">{p}</span> : t('admin.audit.allActions'),
          }))}
        />
        <div className="grid gap-3 md:grid-cols-[minmax(0,16rem)_minmax(0,1fr)_minmax(0,12rem)_auto]">
          <div>
            <label htmlFor="audit-action" className="sr-only">
              {t('admin.audit.actionPh')}
            </label>
            <input
              id="audit-action"
              value={action}
              onChange={(e) => setAction(e.target.value)}
              placeholder={t('admin.audit.actionPh')}
              className="input font-mono text-xs"
              spellCheck={false}
            />
          </div>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
              aria-hidden="true"
            />
            <label htmlFor="audit-actor" className="sr-only">
              {t('admAudit.actorPh')}
            </label>
            <input
              id="audit-actor"
              value={actor}
              onChange={(e) => setActor(e.target.value)}
              placeholder={t('admAudit.actorPh')}
              className="input pl-10"
            />
          </div>
          <div>
            <label htmlFor="audit-outcome" className="sr-only">
              {t('admin.audit.outcome')}
            </label>
            <select
              id="audit-outcome"
              className="input"
              value={outcome}
              onChange={(e) => setOutcome(e.target.value as OutcomeFilter)}
            >
              <option value="all">{t('admin.audit.outcomeAll')}</option>
              <option value="success">{t('admin.audit.outcomeOk')}</option>
              <option value="failure">{t('admin.audit.outcomeKo')}</option>
            </select>
          </div>
          <button type="submit" className="btn btn-secondary h-11">
            <Search className="h-4 w-4" aria-hidden="true" />
            {t('admAudit.filter')}
          </button>
        </div>
      </form>

      <div aria-live="polite" className="space-y-2">
        {error && <Notice tone="bad">{error}</Notice>}
        {entries && (
          <p className="text-xs text-muted">
            {t('admin.audit.showing', { shown: visible.length, n: entries.length })}
          </p>
        )}
      </div>

      <section className="card min-w-0 overflow-hidden" aria-label={t('admin.audit.title')}>
        {entries === null ? (
          <p className="p-8 text-center text-sm text-muted">{t('admin.common.loading')}</p>
        ) : visible.length === 0 ? (
          <EmptyState title={t('admAudit.empty')} />
        ) : (
          <>
            <ul className="divide-y divide-line md:hidden">
              {visible.map((e) => (
                <li key={e.id} className="space-y-1.5 px-4 py-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate font-mono text-xs text-ink">{e.action}</span>
                    <Outcome entry={e} />
                  </div>
                  <p className="truncate text-xs text-ink-2">{actorLabel(e, t('admAudit.system'))}</p>
                  {e.target && (
                    <CopyValue value={e.target} label={t('admin.audit.copyTarget')} head={16} tail={10} />
                  )}
                  <p className="text-xs text-muted" title={e.at}>
                    {formatAuditTime(e.at, locale)}
                    {e.ip ? ` · ${e.ip}` : ''}
                  </p>
                  <Details entry={e} />
                </li>
              ))}
            </ul>
            <div className="hidden overflow-x-auto md:block">
              <table className="table-clean">
                <thead>
                  <tr>
                    <th scope="col" className="!pl-5">
                      {t('admAudit.when')}
                    </th>
                    <th scope="col">{t('admAudit.actor')}</th>
                    <th scope="col">{t('admAudit.action')}</th>
                    <th scope="col">{t('admAudit.target')}</th>
                    <th scope="col">{t('admAudit.origin')}</th>
                    <th scope="col" className="!pr-5 !text-right">
                      {t('admAudit.outcome')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((e) => (
                    <tr key={e.id} className="align-top">
                      <td className="whitespace-nowrap !pl-5 text-xs text-ink-2" title={e.at}>
                        {formatAuditTime(e.at, locale)}
                      </td>
                      <td className="max-w-[14rem] truncate text-xs">
                        {actorLabel(e, t('admAudit.system'))}
                      </td>
                      <td>
                        <span className="font-mono text-xs text-ink">{e.action}</span>
                        <Details entry={e} />
                      </td>
                      <td className="max-w-[14rem]">
                        {e.target ? (
                          <CopyValue
                            value={e.target}
                            label={t('admin.audit.copyTarget')}
                            head={10}
                            tail={6}
                          />
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                      <td className="text-xs">
                        <span className="font-mono text-ink-2">{e.ip || '—'}</span>
                        {e.requestId && (
                          <div className="mt-0.5">
                            <CopyValue
                              value={e.requestId}
                              label={t('admin.audit.copyRequest')}
                              head={8}
                              tail={4}
                            />
                          </div>
                        )}
                      </td>
                      <td className="!pr-5 text-right">
                        <Outcome entry={e} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function AdminAuditRoute() {
  return (
    <RequireAdmin>
      <AdminAudit />
    </RequireAdmin>
  );
}

export default withIsland(AdminAuditRoute);
