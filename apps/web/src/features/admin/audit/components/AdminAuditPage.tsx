import { useCallback, useEffect, useState, type SubmitEvent } from 'react';
import { RefreshCw, ScrollText, Search } from 'lucide-react';
import RequireAdmin from '@/components/guards/RequireAdmin';
import { withIsland } from '@/components/island/withIsland';
import type { AuditEntry } from '@/core/api/types';
import { container } from '@/core/container';
import { errorMessage } from '@/core/errors';
import { useI18n } from '@/hooks/useI18n';
import { useSession } from '@/hooks/useSession';
import { actorLabel, detailsText, formatAuditTime } from '../model';

const { api } = container;

function Outcome({ entry, ok, ko }: { entry: AuditEntry; ok: string; ko: string }) {
  const success = entry.outcome === 'success';
  return (
    <span
      className={`px-2 py-0.5 rounded-full text-[11px] font-display font-bold ${success ? 'bg-leaf-100 text-[#2f6f28]' : 'bg-red-50 text-red-700'}`}
    >
      {success ? ok : ko}
    </span>
  );
}

function Details({ entry, label }: { entry: AuditEntry; label: string }) {
  const text = detailsText(entry);
  if (!text) return null;
  return (
    <details className="mt-1">
      <summary className="cursor-pointer text-xs text-neutral-500">{label}</summary>
      <pre className="mt-1 p-2 rounded-lg bg-black/5 text-[11px] whitespace-pre-wrap break-all max-w-md">
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
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [action, setAction] = useState('');
  const [actor, setActor] = useState('');
  const [query, setQuery] = useState({ action: '', actor: '' });
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

  const applyFilters = (e: SubmitEvent) => {
    e.preventDefault();
    setQuery({ action, actor });
  };

  return (
    <div className="space-y-6 py-4">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <p className="font-lcd text-[11px] uppercase tracking-[0.2em] text-neutral-500 inline-flex items-center gap-1.5">
            <ScrollText className="w-3.5 h-3.5" /> {t('admAudit.kicker')}
          </p>
          <h1 className="text-2xl sm:text-3xl font-extrabold font-display">{t('admAudit.title')}</h1>
          <p className="text-neutral-600 mt-1">{t('admAudit.lead')}</p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="px-4 py-2 rounded-xl border border-black/10 text-sm font-display font-bold inline-flex items-center gap-2 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> {t('admAudit.refresh')}
        </button>
      </div>

      <form onSubmit={applyFilters} className="flex flex-col sm:flex-row gap-3">
        <input
          value={action}
          onChange={(e) => setAction(e.target.value)}
          aria-label={t('admAudit.actionPh')}
          placeholder={t('admAudit.actionPh')}
          className="sm:w-72 px-3 py-2.5 rounded-xl border border-black/10 text-sm font-mono"
        />
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input
            value={actor}
            onChange={(e) => setActor(e.target.value)}
            aria-label={t('admAudit.actorPh')}
            placeholder={t('admAudit.actorPh')}
            className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-black/10 text-sm"
          />
        </div>
        <button
          type="submit"
          className="px-4 py-2.5 rounded-xl bg-black text-white text-sm font-display font-bold"
        >
          <Search className="w-4 h-4 inline" aria-hidden />{' '}
          <span className="sr-only sm:not-sr-only">{t('admAudit.filter')}</span>
        </button>
      </form>

      {error && (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
      <p className="text-xs text-neutral-500">{t('admAudit.count', { n: entries.length })}</p>

      <div className="rounded-2xl sm:rounded-3xl crystal-card overflow-hidden">
        {entries.length === 0 ? (
          <p className="p-8 text-sm text-neutral-500 text-center">{t('admAudit.empty')}</p>
        ) : (
          <>
            <div className="md:hidden divide-y divide-black/5">
              {entries.map((e) => (
                <div key={e.id} className="p-4 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono font-bold break-all">{e.action}</span>
                    <Outcome entry={e} ok={t('admAudit.success')} ko={t('admAudit.failure')} />
                  </div>
                  <div className="text-neutral-600 break-all">{actorLabel(e, t('admAudit.system'))}</div>
                  {e.target && <div className="font-mono text-neutral-500 break-all">{e.target}</div>}
                  <div className="text-neutral-500" title={e.at}>
                    {formatAuditTime(e.at, locale)} {e.ip ? `· ${e.ip}` : ''}
                  </div>
                  <Details entry={e} label={t('admAudit.details')} />
                </div>
              ))}
            </div>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase text-neutral-500 border-b border-black/10">
                  <tr>
                    <th className="px-4 py-3">{t('admAudit.when')}</th>
                    <th className="px-4 py-3">{t('admAudit.actor')}</th>
                    <th className="px-4 py-3">{t('admAudit.action')}</th>
                    <th className="px-4 py-3">{t('admAudit.target')}</th>
                    <th className="px-4 py-3">{t('admAudit.origin')}</th>
                    <th className="px-4 py-3 text-right">{t('admAudit.outcome')}</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e) => (
                    <tr key={e.id} className="border-b border-black/5 align-top">
                      <td className="px-4 py-3 whitespace-nowrap text-xs" title={e.at}>
                        {formatAuditTime(e.at, locale)}
                      </td>
                      <td className="px-4 py-3 text-xs break-all">{actorLabel(e, t('admAudit.system'))}</td>
                      <td className="px-4 py-3">
                        <span className="font-mono text-xs font-bold">{e.action}</span>
                        <Details entry={e} label={t('admAudit.details')} />
                      </td>
                      <td className="px-4 py-3 font-mono text-xs break-all max-w-[14rem]">
                        {e.target || '—'}
                      </td>
                      <td className="px-4 py-3 font-mono text-[11px] text-neutral-500">
                        {e.ip || '—'}
                        {e.requestId && (
                          <div className="truncate max-w-[9rem]" title={e.requestId}>
                            {e.requestId}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Outcome entry={e} ok={t('admAudit.success')} ko={t('admAudit.failure')} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
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
