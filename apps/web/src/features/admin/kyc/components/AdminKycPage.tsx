import { useCallback, useState } from 'react';
import { RefreshCw, Search, UserCheck } from 'lucide-react';
import RequireAdmin from '@/components/guards/RequireAdmin';
import { withIsland } from '@/components/island/withIsland';
import AuthenticatedImage from '@/components/ui/AuthenticatedImage';
import type { KycRecord } from '@/core/api/types';
import { container } from '@/core/container';
import { errorMessage } from '@/core/errors';
import { useI18n } from '@/hooks/useI18n';
import { useSession } from '@/hooks/useSession';
import { useVisibleInterval } from '@/hooks/useVisibleInterval';

type Filter = 'PENDING' | 'APPROVED' | 'REJECTED' | 'ALL';
const FILTERS: Filter[] = ['PENDING', 'APPROVED', 'REJECTED', 'ALL'];

const { api } = container;

function Avatar({ rec, className }: { rec: KycRecord; className: string }) {
  const placeholder = <span className={`${className} rounded-full bg-black/5 inline-block`} />;
  if (!rec.selfieUrl) return placeholder;
  return <AuthenticatedImage path={rec.selfieUrl} className={`${className} rounded-full object-cover`} fallback={placeholder} />;
}

/** Compliance queue: review and approve / reject investor KYC. */
function AdminKyc() {
  const { token } = useSession();
  const { t } = useI18n();
  const [records, setRecords] = useState<KycRecord[]>([]);
  const [filterStatus, setFilterStatus] = useState<Filter>('PENDING');
  const [searchTerm, setSearchTerm] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const fetchRecords = useCallback(async () => {
    if (!token) return;
    setRecords(await api.kyc.list().catch(() => []));
  }, [token]);

  useVisibleInterval(fetchRecords, 4000, Boolean(token), token);

  const update = async (id: string, status: 'APPROVED' | 'REJECTED') => {
    setBusy(id);
    setNotice('');
    try {
      if (status === 'APPROVED') await api.kyc.approve(id);
      else await api.kyc.reject(id, t('admKyc.rejectReason'));
      setNotice(status === 'APPROVED' ? t('admKyc.approveOk', { id }) : t('admKyc.rejectOk', { id }));
      await fetchRecords();
    } catch (err) {
      setNotice(errorMessage(err, t('admKyc.updateFail')));
    } finally {
      setBusy(null);
    }
  };

  const filtered = records.filter((r) => {
    const okStatus = filterStatus === 'ALL' || r.status === filterStatus;
    const q = searchTerm.toLowerCase();
    const okSearch =
      !q ||
      r.fullName.toLowerCase().includes(q) ||
      r.docNumber.includes(searchTerm) ||
      (r.walletAddress || '').toLowerCase().includes(q) ||
      (r.email || '').toLowerCase().includes(q);
    return okStatus && okSearch;
  });

  const statusLabel = (status: KycRecord['status']) =>
    status === 'PENDING' ? t('admKyc.stPending') : status === 'APPROVED' ? t('admKyc.stApproved') : status;
  const filterLabel = (st: Filter) =>
    st === 'ALL' ? t('admKyc.all') : st === 'PENDING' ? t('admKyc.pending') : st === 'APPROVED' ? t('admKyc.approved') : t('admKyc.rejected');

  return (
    <div className="space-y-6 py-4">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <p className="font-lcd text-[11px] uppercase tracking-[0.2em] text-neutral-500 inline-flex items-center gap-1.5">
            <UserCheck className="w-3.5 h-3.5" /> {t('admKyc.kicker')}
          </p>
          <h1 className="text-2xl sm:text-3xl font-extrabold font-display">{t('admKyc.title')}</h1>
          <p className="text-neutral-600 mt-1">{t('admKyc.lead')}</p>
        </div>
        <button
          type="button"
          onClick={() => void fetchRecords()}
          className="px-4 py-2 rounded-xl border border-black/10 text-sm font-display font-bold inline-flex items-center gap-2"
        >
          <RefreshCw className="w-4 h-4" /> {t('admKyc.refresh')}
        </button>
      </div>

      {notice && (
        <p className="text-sm font-bold" role="status">
          {notice}
        </p>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input
            value={searchTerm}
            aria-label={t('admKyc.searchPh')}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={t('admKyc.searchPh')}
            className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-black/10 text-sm"
          />
        </div>
        <div className="flex gap-1 p-1 rounded-xl border border-black/10 bg-white overflow-x-auto">
          {FILTERS.map((st) => (
            <button
              key={st}
              type="button"
              aria-pressed={filterStatus === st}
              onClick={() => setFilterStatus(st)}
              className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-[11px] sm:text-xs font-display font-bold whitespace-nowrap shrink-0 ${
                filterStatus === st ? 'bg-black text-white' : 'text-neutral-500'
              }`}
            >
              {filterLabel(st)}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-2xl sm:rounded-3xl crystal-card overflow-hidden">
        {filtered.length === 0 ? (
          <p className="p-8 text-sm text-neutral-500 text-center">{filterStatus === 'PENDING' ? t('admKyc.emptyPending') : t('admKyc.emptyFilter')}</p>
        ) : (
          <>
            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-black/5">
              {filtered.map((rec) => (
                <div key={rec.id} className="p-4 space-y-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar rec={rec} className="w-10 h-10 shrink-0" />
                    <div className="min-w-0">
                      <div className="font-display font-extrabold truncate">{rec.fullName}</div>
                      <div className="text-xs text-neutral-500 font-mono truncate">{rec.email || rec.id}</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-neutral-500 block">CUIT</span>
                      <span className="font-mono">{rec.docNumber || '—'}</span>
                    </div>
                    <div>
                      <span className="text-neutral-500 block">{t('admKyc.status')}</span>
                      <span className="font-bold">{statusLabel(rec.status)}</span>
                    </div>
                    <div className="col-span-2 min-w-0">
                      <span className="text-neutral-500 block">Wallet</span>
                      <span className="font-mono break-all">{rec.walletAddress || '—'}</span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    {rec.status !== 'APPROVED' && (
                      <button
                        type="button"
                        disabled={busy === rec.id}
                        onClick={() => update(rec.id, 'APPROVED')}
                        className="w-full px-3 py-2 rounded-lg bg-black text-white text-xs font-display font-bold disabled:opacity-40"
                      >
                        {t('admKyc.approve')}
                      </button>
                    )}
                    {rec.status === 'PENDING' && (
                      <button
                        type="button"
                        disabled={busy === rec.id}
                        onClick={() => update(rec.id, 'REJECTED')}
                        className="w-full px-3 py-2 rounded-lg border border-black/10 text-xs font-display font-bold disabled:opacity-40"
                      >
                        {t('admKyc.reject')}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase text-neutral-500 border-b border-black/10">
                  <tr>
                    <th className="px-4 py-3">{t('admKyc.request')}</th>
                    <th className="px-4 py-3">CUIT</th>
                    <th className="px-4 py-3">Wallet</th>
                    <th className="px-4 py-3">{t('admKyc.status')}</th>
                    <th className="px-4 py-3 text-right">{t('admKyc.alta')}</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((rec) => (
                    <tr key={rec.id} className="border-b border-black/5">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <Avatar rec={rec} className="w-10 h-10" />
                          <div>
                            <div className="font-display font-extrabold">{rec.fullName}</div>
                            <div className="text-xs text-neutral-500 font-mono">{rec.email || rec.id}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{rec.docNumber || '—'}</td>
                      <td className="px-4 py-3 font-mono text-xs break-all max-w-[140px]">{rec.walletAddress || '—'}</td>
                      <td className="px-4 py-3 text-xs font-bold">{statusLabel(rec.status)}</td>
                      <td className="px-4 py-3 text-right space-x-2 whitespace-nowrap">
                        {rec.status !== 'APPROVED' && (
                          <button
                            type="button"
                            disabled={busy === rec.id}
                            onClick={() => update(rec.id, 'APPROVED')}
                            className="px-3 py-1.5 rounded-lg bg-black text-white text-xs font-display font-bold disabled:opacity-40"
                          >
                            {t('admKyc.approve')}
                          </button>
                        )}
                        {rec.status === 'PENDING' && (
                          <button
                            type="button"
                            disabled={busy === rec.id}
                            onClick={() => update(rec.id, 'REJECTED')}
                            className="px-3 py-1.5 rounded-lg border border-black/10 text-xs font-display font-bold disabled:opacity-40"
                          >
                            {t('admKyc.reject')}
                          </button>
                        )}
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

function AdminKycPage() {
  return (
    <RequireAdmin>
      <AdminKyc />
    </RequireAdmin>
  );
}

export default withIsland(AdminKycPage);
