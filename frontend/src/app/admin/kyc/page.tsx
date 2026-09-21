'use client';

import { useState } from 'react';
import { RefreshCw, Search, UserCheck } from 'lucide-react';
import { KycRecord, API_BASE_URL } from '../../../lib/api';
import { useAuth } from '../../../context/AuthContext';
import { useVisibleInterval } from '../../../lib/useVisibleInterval';

export default function AdminKycPage() {
  const { token } = useAuth();
  const [records, setRecords] = useState<KycRecord[]>([]);
  const [filterStatus, setFilterStatus] = useState('PENDING');
  const [searchTerm, setSearchTerm] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const fetchRecords = async () => {
    if (!token) return;
    const res = await fetch(`${API_BASE_URL}/api/kyc`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (Array.isArray(data?.data)) setRecords(data.data);
    else setRecords([]);
  };

  useVisibleInterval(fetchRecords, 4000, Boolean(token), token);

  const update = async (id: string, status: 'APPROVED' | 'REJECTED') => {
    setBusy(id);
    setNotice('');
    try {
      const endpoint = status === 'APPROVED' ? 'approve' : 'reject';
      const res = await fetch(`${API_BASE_URL}/api/kyc/${id}/${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ reason: status === 'REJECTED' ? 'Documentación insuficiente' : undefined }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || json.error || 'No se pudo actualizar');
      setNotice(status === 'APPROVED' ? `Alta OK: ${id}` : `Rechazado: ${id}`);
      await fetchRecords();
    } catch (err: any) {
      setNotice(err.message);
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
      ((r as any).email || '').toLowerCase().includes(q);
    return okStatus && okSearch;
  });

  return (
    <div className="space-y-6 py-4">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <p className="font-lcd text-[11px] uppercase tracking-[0.2em] text-neutral-500 inline-flex items-center gap-1.5">
            <UserCheck className="w-3.5 h-3.5" /> Altas KYC
          </p>
          <h1 className="text-2xl sm:text-3xl font-extrabold font-display">Dar de alta inversores</h1>
          <p className="text-neutral-600 mt-1">
            Cuando alguien se registra y manda nombre, CUIT y foto, aparece acá. Aprobá para que pueda suscribir y operar.
          </p>
        </div>
        <button
          type="button"
          onClick={fetchRecords}
          className="px-4 py-2 rounded-xl border border-black/10 text-sm font-display font-bold inline-flex items-center gap-2"
        >
          <RefreshCw className="w-4 h-4" /> Actualizar
        </button>
      </div>

      {notice && <p className="text-sm font-bold">{notice}</p>}

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Nombre, CUIT, email o wallet"
            className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-black/10 text-sm"
          />
        </div>
        <div className="flex gap-1 p-1 rounded-xl border border-black/10 bg-white overflow-x-auto">
          {['PENDING', 'APPROVED', 'REJECTED', 'ALL'].map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setFilterStatus(st)}
              className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-[11px] sm:text-xs font-display font-bold whitespace-nowrap shrink-0 ${
                filterStatus === st ? 'bg-black text-white' : 'text-neutral-500'
              }`}
            >
              {st === 'ALL' ? 'Todos' : st === 'PENDING' ? 'Pendientes' : st === 'APPROVED' ? 'Aprobados' : 'Rechazados'}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-2xl sm:rounded-3xl crystal-card overflow-hidden">
        {filtered.length === 0 ? (
          <p className="p-8 text-sm text-neutral-500 text-center">
            {filterStatus === 'PENDING' ? 'No hay solicitudes pendientes.' : 'No hay registros con ese filtro.'}
          </p>
        ) : (
          <>
            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-black/5">
              {filtered.map((rec) => (
                <div key={rec.id} className="p-4 space-y-3">
                  <div className="flex items-center gap-3 min-w-0">
                    {rec.selfieUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={rec.selfieUrl.startsWith('http') ? rec.selfieUrl : `${API_BASE_URL}${rec.selfieUrl}`}
                        alt=""
                        className="w-10 h-10 rounded-full object-cover shrink-0"
                      />
                    ) : (
                      <span className="w-10 h-10 rounded-full bg-black/5 shrink-0" />
                    )}
                    <div className="min-w-0">
                      <div className="font-display font-extrabold truncate">{rec.fullName}</div>
                      <div className="text-xs text-neutral-500 font-mono truncate">{(rec as any).email || rec.id}</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-neutral-500 block">CUIT</span>
                      <span className="font-mono">{rec.docNumber || '—'}</span>
                    </div>
                    <div>
                      <span className="text-neutral-500 block">Estado</span>
                      <span className="font-bold">
                        {rec.status === 'PENDING' ? 'Pendiente' : rec.status === 'APPROVED' ? 'Aprobado' : rec.status}
                      </span>
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
                        Dar de alta
                      </button>
                    )}
                    {rec.status === 'PENDING' && (
                      <button
                        type="button"
                        disabled={busy === rec.id}
                        onClick={() => update(rec.id, 'REJECTED')}
                        className="w-full px-3 py-2 rounded-lg border border-black/10 text-xs font-display font-bold disabled:opacity-40"
                      >
                        Rechazar
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
                    <th className="px-4 py-3">Solicitud</th>
                    <th className="px-4 py-3">CUIT</th>
                    <th className="px-4 py-3">Wallet</th>
                    <th className="px-4 py-3">Estado</th>
                    <th className="px-4 py-3 text-right">Alta</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((rec) => (
                    <tr key={rec.id} className="border-b border-black/5">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {rec.selfieUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={rec.selfieUrl.startsWith('http') ? rec.selfieUrl : `${API_BASE_URL}${rec.selfieUrl}`}
                              alt=""
                              className="w-10 h-10 rounded-full object-cover"
                            />
                          ) : (
                            <span className="w-10 h-10 rounded-full bg-black/5" />
                          )}
                          <div>
                            <div className="font-display font-extrabold">{rec.fullName}</div>
                            <div className="text-xs text-neutral-500 font-mono">{(rec as any).email || rec.id}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{rec.docNumber || '—'}</td>
                      <td className="px-4 py-3 font-mono text-xs break-all max-w-[140px]">{rec.walletAddress || '—'}</td>
                      <td className="px-4 py-3 text-xs font-bold">
                        {rec.status === 'PENDING' ? 'Pendiente' : rec.status === 'APPROVED' ? 'Aprobado' : rec.status}
                      </td>
                      <td className="px-4 py-3 text-right space-x-2 whitespace-nowrap">
                        {rec.status !== 'APPROVED' && (
                          <button
                            type="button"
                            disabled={busy === rec.id}
                            onClick={() => update(rec.id, 'APPROVED')}
                            className="px-3 py-1.5 rounded-lg bg-black text-white text-xs font-display font-bold disabled:opacity-40"
                          >
                            Dar de alta
                          </button>
                        )}
                        {rec.status === 'PENDING' && (
                          <button
                            type="button"
                            disabled={busy === rec.id}
                            onClick={() => update(rec.id, 'REJECTED')}
                            className="px-3 py-1.5 rounded-lg border border-black/10 text-xs font-display font-bold disabled:opacity-40"
                          >
                            Rechazar
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
