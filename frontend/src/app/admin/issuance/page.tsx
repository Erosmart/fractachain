'use client';

import { useEffect, useState } from 'react';
import { API_BASE_URL, bearerHeaders } from '../../../lib/api';
import { useAuth } from '../../../context/AuthContext';

const empty = {
  legalName: '',
  tradeName: '',
  cuit: '',
  jurisdiction: 'Argentina',
  sector: 'Energía',
  ticker: '',
  tokenTicker: '',
  isin: '',
  authorizedShares: 1000000,
  sharesToTokenize: 10000,
  pricePerShareUsdc: 10,
  cajaSubaccount: '',
  custodianCuit: '30-50001091-2',
  cnvRecordId: '',
  bymaRequestId: '',
  legalTermsUri: 'https://fractachain.ar/legal/',
  estatutoHash: '',
  auditor: 'PwC / CNV RG 1150',
  issuerPublicKey: '',
  proceedsWallet: '',
  paymentKind: 'USDC',
  offeringSoftCapUsdc: 15000,
  offeringHardCapUsdc: 100000,
  offeringDays: 21,
  tnaUsd: 0,
  minInvestmentUsdc: 100,
  useOfProceeds: 'Capital de trabajo y listado primario de acciones tokenizadas.',
};

export default function AdminIssuancePage() {
  const { token } = useAuth();
  const [form, setForm] = useState(empty);
  const [listings, setListings] = useState<any[]>([]);
  const [notice, setNotice] = useState('');
  const [mintAmount, setMintAmount] = useState(1000);
  const [settlePolicy, setSettlePolicy] = useState<'ON_MIN' | 'ON_DATE'>('ON_MIN');
  const [settleAt, setSettleAt] = useState('');
  const [dividendAmount, setDividendAmount] = useState(1000);

  const set = (k: string, v: string | number) => setForm((f) => ({ ...f, [k]: v }));

  const authHeaders = (): Record<string, string> => ({
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  });

  const load = async () => {
    const res = await fetch(`${API_BASE_URL}/api/listings`, {
      headers: bearerHeaders(token),
    }).then((r) => r.json()).catch(() => null);
    if (Array.isArray(res?.data)) setListings(res.data);
  };

  useEffect(() => {
    if (!token) return;
    load();
    fetch(`${API_BASE_URL}/api/admin/testnet`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((json) => {
        if (!json?.data) return;
        setSettlePolicy(json.data.settlePolicy === 'ON_DATE' ? 'ON_DATE' : 'ON_MIN');
        if (json.data.settleAt) {
          const d = new Date(json.data.settleAt);
          const pad = (n: number) => String(n).padStart(2, '0');
          setSettleAt(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`);
        }
        const issuer = json.data.deployment?.issuer;
        if (issuer) {
          setForm((f) => (f.issuerPublicKey ? f : { ...f, issuerPublicKey: issuer }));
        }
      })
      .catch(() => {});
  }, [token]);

  const flash = (m: string) => {
    setNotice(m);
    setTimeout(() => setNotice(''), 5000);
  };

  const call = async (url: string, body?: unknown) => {
    const res = await fetch(`${API_BASE_URL}${url}`, {
      method: 'POST',
      headers: authHeaders(),
      body: body ? JSON.stringify(body) : '{}',
    });
    const json = await res.json();
    if (!res.ok || !json.success) throw new Error(json.message || 'Error');
    return json.data;
  };

  const create = async () => {
    const wallet = form.proceedsWallet.trim();
    if (!wallet || !wallet.startsWith('G') || wallet.length < 56) {
      flash('La wallet que cobra la licitación es obligatoria (dirección G… de Stellar)');
      return;
    }
    try {
      const data = await call('/api/listings', {
        ...form,
        tokenTicker: form.tokenTicker || `t${form.ticker}`,
        estatutoHash: form.estatutoHash || `0x${Date.now().toString(16)}estatuto`,
      });
      flash(`Dossier ${data.id} creado. Ahora deployá el contrato.`);
      load();
    } catch (e: any) {
      flash(e.message);
    }
  };

  const act = async (id: string, path: string, body?: unknown) => {
    try {
      const data = await call(`/api/listings/${id}/${path}`, body);
      const hash = data.onChain?.hash;
      flash(`${path} OK · estado ${data.status}${hash ? ` · ${hash}` : ''}`);
      load();
    } catch (e: any) {
      flash(e.message);
    }
  };

  const openLicitacion = async (id: string) => {
    const el = document.getElementById(`proceeds-${id}`) as HTMLInputElement | null;
    const wallet = (el?.value || '').trim();
    if (!wallet || !wallet.startsWith('G') || wallet.length < 56) {
      flash('Antes de abrir la licitación indicá la wallet G… que cobra los fondos');
      el?.focus();
      return;
    }
    try {
      await call(`/api/listings/${id}/proceeds-wallet`, { wallet });
      await act(id, 'licitacion', { settlePolicy, settleAt: settlePolicy === 'ON_DATE' ? settleAt : undefined });
    } catch (e: any) {
      flash(e.message);
    }
  };

  const payDividend = async (id: string) => {
    try {
      const data = await call(`/api/listings/${id}/dividends`, { amountUsdc: dividendAmount });
      flash(`Dividendo ${data.id}: ${data.totalUsdc} USDC a ${data.holdersPaid} tenedores (${data.perShare} por acción)`);
      load();
    } catch (e: any) {
      flash(e.message);
    }
  };

  return (
    <div className="space-y-8 py-6">
      <div>
        <p className="font-lcd text-[11px] uppercase tracking-[0.2em] text-neutral-500">Salida a bolsa</p>
        <h1 className="text-3xl font-extrabold font-display">Listar empresa, mintear y licitar</h1>
        <p className="text-neutral-600 mt-1 max-w-2xl">
          Pedimos el expediente completo, deployamos el vault, minteamos 1:1 contra Caja de Valores y abrimos la licitación primaria.
          Al cerrar con éxito, el USDC va a la wallet de cobro de la empresa. El secundario cotiza en el order book nativo de Stellar, y solo opera quien tenga KYC aprobado.
        </p>
      </div>
      {notice && <div className="p-3 rounded-2xl bg-black text-white text-sm">{notice}</div>}

      <section className="p-6 rounded-3xl crystal-card space-y-4">
        <h2 className="font-section text-xl font-extrabold">1. Expediente de la empresa</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          {[
            ['legalName', 'Razón social'],
            ['tradeName', 'Nombre comercial'],
            ['cuit', 'CUIT'],
            ['ticker', 'Ticker BYMA'],
            ['tokenTicker', 'Token (tYPF…)'],
            ['isin', 'ISIN'],
            ['sector', 'Sector'],
            ['cajaSubaccount', 'Subcuenta Caja de Valores'],
            ['cnvRecordId', 'Expediente CNV'],
            ['bymaRequestId', 'Pedido BYMA'],
            ['legalTermsUri', 'URI términos legales'],
            ['estatutoHash', 'Hash estatuto / fideicomiso'],
            ['auditor', 'Auditor'],
            ['issuerPublicKey', 'Cuenta emisora del token (G…)'],
            ['useOfProceeds', 'Uso de fondos'],
          ].map(([k, label]) => (
            <label key={k} className="text-sm space-y-1">
              <span className="font-bold">{label}</span>
              <input
                className="w-full px-3 py-2 rounded-xl border border-black/10"
                value={(form as any)[k]}
                onChange={(e) => set(k, e.target.value)}
              />
            </label>
          ))}
          <label className="sm:col-span-2 text-sm space-y-1 p-4 rounded-2xl border border-black/15 bg-black/[0.03]">
            <span className="font-bold">Wallet que cobra la licitación (obligatoria)</span>
            <input
              className="w-full px-3 py-2 rounded-xl border border-black/10 font-mono"
              placeholder="G… tesorería de la empresa"
              value={form.proceedsWallet}
              onChange={(e) => set('proceedsWallet', e.target.value.trim())}
            />
            <span className="block text-xs text-neutral-600">
              Cuando la oferta cierra con éxito, el USDC recaudado va a esta dirección — es la tesorería de
              la empresa, no la cuenta emisora del token. Los dividendos después también salen de esa
              tesorería: el contrato los reparte pro-rata y cada inversor los cobra en su propia wallet.
            </span>
          </label>
          <label className="text-sm space-y-1">
            <span className="font-bold">Acciones a tokenizar</span>
            <input type="number" className="w-full px-3 py-2 rounded-xl border border-black/10" value={form.sharesToTokenize} onChange={(e) => set('sharesToTokenize', Number(e.target.value))} />
          </label>
          <label className="text-sm space-y-1">
            <span className="font-bold">Precio por acción USD</span>
            <input type="number" className="w-full px-3 py-2 rounded-xl border border-black/10" value={form.pricePerShareUsdc} onChange={(e) => set('pricePerShareUsdc', Number(e.target.value))} />
          </label>
          <label className="text-sm space-y-1">
            <span className="font-bold">Mínimo de inversión USDC</span>
            <input type="number" className="w-full px-3 py-2 rounded-xl border border-black/10" value={form.minInvestmentUsdc} onChange={(e) => set('minInvestmentUsdc', Number(e.target.value))} />
          </label>
          <label className="text-sm space-y-1">
            <span className="font-bold">Soft cap USDC</span>
            <input type="number" className="w-full px-3 py-2 rounded-xl border border-black/10" value={form.offeringSoftCapUsdc} onChange={(e) => set('offeringSoftCapUsdc', Number(e.target.value))} />
          </label>
          <label className="text-sm space-y-1">
            <span className="font-bold">Hard cap USDC</span>
            <input type="number" className="w-full px-3 py-2 rounded-xl border border-black/10" value={form.offeringHardCapUsdc} onChange={(e) => set('offeringHardCapUsdc', Number(e.target.value))} />
          </label>
          <label className="text-sm space-y-1">
            <span className="font-bold">Días de licitación</span>
            <input type="number" className="w-full px-3 py-2 rounded-xl border border-black/10" value={form.offeringDays} onChange={(e) => set('offeringDays', Number(e.target.value))} />
          </label>
        </div>
        <button type="button" onClick={create} className="px-5 py-3 rounded-2xl bg-black text-white font-display font-bold">
          Guardar expediente
        </button>
      </section>

      <section className="space-y-4">
        <h2 className="font-section text-xl font-extrabold">2–4. Deploy, mint y licitación</h2>
        <div className="p-5 rounded-3xl crystal-card space-y-3">
          <p className="font-display font-extrabold">¿Cuándo se reparte el token?</p>
          <label className="block text-sm">
            <input type="radio" className="mr-2" checked={settlePolicy === 'ON_MIN'} onChange={() => setSettlePolicy('ON_MIN')} />
            Cuando se alcance el mínimo de inversión
          </label>
          <label className="block text-sm">
            <input type="radio" className="mr-2" checked={settlePolicy === 'ON_DATE'} onChange={() => setSettlePolicy('ON_DATE')} />
            Esperar a esta fecha
          </label>
          {settlePolicy === 'ON_DATE' && (
            <input
              type="datetime-local"
              className="w-full max-w-sm px-3 py-2 rounded-xl border border-black/10"
              value={settleAt}
              onChange={(e) => setSettleAt(e.target.value)}
            />
          )}
          <p className="text-xs text-neutral-500">Se usa al abrir una licitación o al guardar el cierre de una ya abierta. El default también está en Admin → Testnet.</p>
        </div>
        {listings.length === 0 && <p className="text-neutral-500">Todavía no hay expedientes.</p>}
        {listings.map((l) => (
          <article key={l.id} className="p-5 rounded-3xl crystal-card space-y-3">
            <div className="flex flex-wrap justify-between gap-2">
              <div>
                <div className="font-display font-extrabold">{l.dossier.tokenTicker} · {l.dossier.legalName}</div>
                <div className="text-xs text-neutral-500 font-mono">{l.id} · {l.status}</div>
              </div>
              <div className="text-xs text-neutral-600">
                Minteado {l.tokensMinted}/{l.dossier.sharesToTokenize} · raised ${l.raisedUsdc}
                <div>
                  {l.settlePolicy === 'ON_DATE'
                    ? `Reparte el ${l.settleAt ? new Date(l.settleAt).toLocaleString() : '—'}`
                    : 'Reparte al alcanzar el mínimo'}
                </div>
              </div>
            </div>
            {l.stockContract && <p className="text-[11px] font-mono break-all">stock {l.stockContract}</p>}
            {l.licitacionContract && <p className="text-[11px] font-mono break-all">licitación {l.licitacionContract}</p>}
            {l.finalizeHash && (
              <p className="text-[11px] font-mono break-all">
                finalize{' '}
                <a href={`https://stellar.expert/explorer/testnet/tx/${l.finalizeHash}`} target="_blank" rel="noreferrer" className="underline">
                  {l.finalizeHash}
                </a>
              </p>
            )}
            <p className="text-xs text-neutral-600">
              Cobra en{' '}
              <span className="font-mono break-all">{l.dossier.proceedsWallet || 'sin configurar'}</span>
              {l.proceedsPaidAt
                ? ` · pagado ${new Date(l.proceedsPaidAt).toLocaleString()}`
                : l.status === 'CLOSED_SUCCESS'
                  ? ' · cierre sin pago (faltaba la wallet)'
                  : ' · se acredita al cerrar la oferta'}
            </p>
            {!(l.raisedUsdc > 0) ? (
              <div className="flex flex-wrap gap-2 items-center">
                <input
                  placeholder="Wallet de cobro G… (obligatoria para abrir)"
                  defaultValue={l.dossier.proceedsWallet || ''}
                  id={`proceeds-${l.id}`}
                  className="flex-1 min-w-[16rem] px-3 py-2 rounded-xl border border-black/10 text-xs font-mono"
                />
                <button
                  type="button"
                  onClick={() => {
                    const el = document.getElementById(`proceeds-${l.id}`) as HTMLInputElement | null;
                    act(l.id, 'proceeds-wallet', { wallet: el?.value || '' });
                  }}
                  className="px-3 py-2 rounded-xl border border-black/10 text-xs font-bold"
                >
                  Guardar wallet de cobro
                </button>
              </div>
            ) : (
              <input type="hidden" id={`proceeds-${l.id}`} defaultValue={l.dossier.proceedsWallet || ''} />
            )}
            <div className="flex flex-wrap gap-2 items-center">
              <button type="button" onClick={() => act(l.id, 'deploy')} className="px-3 py-2 rounded-xl bg-black text-white text-xs font-bold">
                Deploy contrato
              </button>
              <input
                type="number"
                className="w-28 px-2 py-2 rounded-xl border border-black/10 text-sm"
                value={mintAmount}
                onChange={(e) => setMintAmount(Number(e.target.value))}
              />
              <button type="button" onClick={() => act(l.id, 'mint', { amount: mintAmount })} className="px-3 py-2 rounded-xl border border-black/10 text-xs font-bold">
                Mintear tokens
              </button>
              <button
                type="button"
                onClick={() => openLicitacion(l.id)}
                className="px-3 py-2 rounded-xl border border-black/10 text-xs font-bold"
              >
                Abrir licitación
              </button>
              {l.status === 'LISTED' && (
                <>
                  <button
                    type="button"
                    onClick={() => act(l.id, 'settle', { settlePolicy, settleAt: settlePolicy === 'ON_DATE' ? settleAt : undefined })}
                    className="px-3 py-2 rounded-xl border border-black/10 text-xs font-bold"
                  >
                    Guardar cuándo se reparte
                  </button>
                  <button type="button" onClick={() => act(l.id, l.dossier.paymentKind === 'XLM' ? 'finalize' : 'close')} className="px-3 py-2 rounded-xl border border-black/10 text-xs font-bold">
                    {l.dossier.paymentKind === 'XLM'
                      ? 'Finalizar on-chain (hard cap o deadline)'
                      : `Cerrar ahora (mínimo ${l.dossier.offeringSoftCapUsdc} USDC)`}
                  </button>
                </>
              )}
              <a href={`/market/${l.id}`} className="px-3 py-2 text-xs font-bold underline">
                Ver ficha pública
              </a>
            </div>
            {l.status === 'CLOSED_SUCCESS' && (
              <div className="flex flex-wrap gap-2 items-center pt-2 border-t border-black/10">
                <span className="text-xs font-bold">Pagar dividendo</span>
                <input
                  type="number"
                  className="w-32 px-2 py-2 rounded-xl border border-black/10 text-sm"
                  value={dividendAmount}
                  onChange={(e) => setDividendAmount(Number(e.target.value))}
                />
                <span className="text-xs text-neutral-500">USDC, pro-rata entre tenedores</span>
                <button
                  type="button"
                  onClick={() => payDividend(l.id)}
                  className="px-3 py-2 rounded-xl bg-black text-white text-xs font-bold"
                >
                  Depositar y repartir
                </button>
              </div>
            )}
          </article>
        ))}
      </section>
    </div>
  );
}
