'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { API_BASE_URL, bearerHeaders, getApiBaseUrl } from '../../../lib/api';
import { useAuth } from '../../../context/AuthContext';
import { useI18n } from '../../../context/I18nContext';
import { formatInt } from '../../../lib/format';
import { isSelfCustody, signAndRelay } from '../../../lib/selfCustody';

export default function PoolDetailPage() {
  const params = useParams();
  const poolId = params.id as string;
  const { user, token, refreshUser, approveToken, claimTokens, finalizeOffering, refundContribution } = useAuth();
  const { t } = useI18n();
  const [listing, setListing] = useState<any>(null);
  const [validation, setValidation] = useState<any>(null);
  const [loaded, setLoaded] = useState(false);
  const [amount, setAmount] = useState(100);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [lastHash, setLastHash] = useState<{ kind: string; hash: string; explorer?: string | null } | null>(null);

  const load = useCallback(() => {
    const auth = token || (typeof window !== 'undefined' ? localStorage.getItem('fc_auth_token') : null);
    return fetch(`${API_BASE_URL}/api/listings/${poolId}`, {
      headers: bearerHeaders(auth),
    })
      .then((r) => r.json())
      .then((json) => {
        if (json?.success && json.data) {
          setListing(json.data);
          setValidation(json.validation);
          const min = json.data.dossier?.minInvestmentUsdc || json.data.dossier?.pricePerShareUsdc || 100;
          setAmount((prev) => prev || min);
        }
        return json;
      });
  }, [poolId, token]);

  useEffect(() => {
    load()
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [load]);

  const invest = async () => {
    setNotice('');
    const auth = token || (typeof window !== 'undefined' ? localStorage.getItem('fc_auth_token') : null);
    const xlm = listing?.dossier?.paymentKind === 'XLM';
    if (!auth) {
      setNotice(t(xlm ? 'market.loginToContributeXlm' : 'market.loginToContribute'));
      return;
    }
    setBusy(true);
    try {
      let data: any;
      if (xlm && isSelfCustody(user)) {
        // Wallet propia: el contrato pide la firma del inversor, así que el
        // backend arma la invocación y Freighter la firma.
        setNotice(t('market.freighterSign'));
        data = await signAndRelay({
          prepare: `/api/listings/${poolId}/contribute/prepare`,
          submit: `/api/listings/${poolId}/contribute/submit`,
          token: auth,
          body: { usdcAmount: Number(amount) },
        });
      } else {
        const res = await fetch(`${getApiBaseUrl()}/api/listings/${poolId}/contribute`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${auth}`,
          },
          body: JSON.stringify({ usdcAmount: Number(amount) }),
        });
        const raw = await res.text();
        let json: any = {};
        try {
          json = raw ? JSON.parse(raw) : {};
        } catch {
          throw new Error('El servidor no respondió bien. ¿Está el API en el puerto 4000?');
        }
        if (!res.ok || json.success === false) {
          throw new Error(json.message || 'No se pudo suscribir');
        }
        data = json.data;
      }
      setListing(data);
      await refreshUser();
      await load();
      const onChain = data?.onChain;
      const contributeHash = onChain?.contributeHash;
      const hash = contributeHash || onChain?.trustlineHash;
      const raised = Number(data.raisedUsdc).toLocaleString('es-AR');
      const unit = data?.dossier?.paymentKind === 'XLM' ? 'XLM' : 'USDC';
      if (contributeHash) {
        setLastHash({ kind: 'contribute', hash: contributeHash, explorer: onChain?.contributeExplorer });
        setNotice(t('market.subscribedContributeHash', { n: raised, hash: contributeHash }));
      } else if (hash) {
        setLastHash({ kind: 'trustline', hash, explorer: onChain?.trustlineExplorer });
        setNotice(t('market.subscribedHash', { n: raised, hash }));
      } else if (unit === 'XLM') {
        setNotice(t('market.subscribedRaisedXlm', { n: raised }));
      } else {
        setNotice(t('market.subscribedRaised', { n: raised }));
      }
    } catch (e: any) {
      const msg = e?.message || 'No se pudo aportar';
      setNotice(/failed to fetch/i.test(msg) ? t('market.apiDown') : msg);
    } finally {
      setBusy(false);
    }
  };

  const runFinalize = async () => {
    setNotice('');
    if (!token) {
      setNotice(t('market.loginToFinalize'));
      return;
    }
    setBusy(true);
    try {
      const data = await finalizeOffering(poolId);
      const hash = data?.onChain?.hash;
      if (hash) setLastHash({ kind: 'finalize', hash, explorer: data?.onChain?.explorer });
      setNotice(hash ? t('market.finalizeNotice', { hash }) : data?.onChain?.note || 'finalize() OK');
      await load();
      await refreshUser();
    } catch (e: any) {
      setNotice(e?.message || t('market.finalizeNeedCap'));
    } finally {
      setBusy(false);
    }
  };

  const runRefund = async () => {
    setNotice('');
    if (!token) {
      setNotice(t('market.loginToRefund'));
      return;
    }
    setBusy(true);
    try {
      const data = await refundContribution(poolId, isSelfCustody(user));
      const hash = data?.onChain?.hash;
      if (hash) setLastHash({ kind: 'refund', hash, explorer: data?.onChain?.explorer });
      setNotice(hash ? t('market.refundNotice', { hash }) : data?.onChain?.note || 'refund() OK');
      await load();
      await refreshUser();
    } catch (e: any) {
      setNotice(e?.message || 'No se pudo reembolsar');
    } finally {
      setBusy(false);
    }
  };

  if (listing && validation) {
    const d = listing.dossier;
    const xlm = d.paymentKind === 'XLM';
    const unit = xlm ? 'XLM' : 'USDC';
    const live = listing.onChain || {};
    const stateName = live.stateName;
    const canFinalize = Boolean(live.canFinalize);
    const failed = listing.status === 'CLOSED_FAILED' || stateName === 'Failed';
    const success = listing.status === 'CLOSED_SUCCESS' || stateName === 'Successful' || stateName === 'Terminated';
    const holding = user?.holdings?.find((h) => h.listingId === listing.id);
    const canClaim =
      success &&
      Boolean(user?.trustlines?.includes(listing.id)) &&
      (holding?.tokensOwed || 0) > 0 &&
      !holding?.refundedAt;
    const canRefund =
      xlm && failed && Boolean(holding) && !holding?.refundedAt;
    const statusLabel = failed
      ? t('market.stateFailed')
      : success
        ? t('market.stateSuccess')
        : canFinalize
          ? t('market.stateReady')
          : t('market.stateOpen');

    return (
      <div className="max-w-5xl mx-auto py-6 space-y-6">
      <div className="rounded-2xl border border-amber-300/80 bg-amber-50 px-4 py-3 text-sm text-amber-950 mb-4">
        {t('market.honestyBanner')}
      </div>
        <Link href="/market" className="inline-flex items-center gap-1.5 text-sm text-neutral-500">
          <ArrowLeft className="w-4 h-4" /> {t('market.back')}
        </Link>
        <div className="grid lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 space-y-5">
            <div className="p-6 rounded-3xl crystal-card space-y-3">
              <p className="font-lcd text-[11px] uppercase tracking-[0.2em] text-neutral-500">{d.tokenTicker} · {d.ticker}</p>
              <h1 className="text-3xl font-extrabold font-display">{d.legalName}</h1>
              <p className="text-neutral-600">{d.useOfProceeds}</p>
              {xlm && (
                <p className="text-xs text-neutral-500">{t('market.finalizeRule')}</p>
              )}
            </div>
            <div className="p-6 rounded-3xl crystal-card space-y-3">
              <h2 className="font-section text-xl font-extrabold flex items-center gap-2">
                <ShieldCheck className="w-5 h-5" /> {t('market.dossier')}
              </h2>
              <dl className="grid sm:grid-cols-2 gap-3 text-sm">
                <div><dt className="text-neutral-500">CUIT</dt><dd className="font-bold">{d.cuit}</dd></div>
                <div><dt className="text-neutral-500">ISIN</dt><dd className="font-mono">{d.isin}</dd></div>
                <div><dt className="text-neutral-500">CNV</dt><dd>{d.cnvRecordId}</dd></div>
                <div><dt className="text-neutral-500">BYMA</dt><dd>{d.bymaRequestId || '—'}</dd></div>
                <div><dt className="text-neutral-500">Caja de Valores</dt><dd className="font-mono text-xs">{d.cajaSubaccount}</dd></div>
                <div><dt className="text-neutral-500">Custodio CUIT</dt><dd>{d.custodianCuit}</dd></div>
                <div><dt className="text-neutral-500">Auditor</dt><dd>{d.auditor}</dd></div>
                <div><dt className="text-neutral-500">Respaldo</dt><dd>{validation.token.backing}</dd></div>
                <div className="sm:col-span-2"><dt className="text-neutral-500">Hash estatuto</dt><dd className="font-mono text-xs break-all">{d.estatutoHash}</dd></div>
                <div className="sm:col-span-2"><dt className="text-neutral-500">Stock vault</dt><dd className="font-mono text-xs break-all">{listing.stockContract}</dd></div>
                <div className="sm:col-span-2">
                  <dt className="text-neutral-500">Licitación</dt>
                  <dd className="font-mono text-xs break-all">
                    {String(listing.licitacionContract || '').startsWith('C') ? (
                      <a
                        href={`https://stellar.expert/explorer/testnet/contract/${listing.licitacionContract}`}
                        target="_blank"
                        rel="noreferrer"
                        className="underline"
                      >
                        {listing.licitacionContract}
                      </a>
                    ) : (
                      listing.licitacionContract
                    )}
                  </dd>
                </div>
                <div className="sm:col-span-2"><dt className="text-neutral-500">Depósito CV</dt><dd className="font-mono text-xs break-all">{listing.cvDepositHash}</dd></div>
              </dl>
              <ul className="text-sm space-y-1 pt-2">
                {validation.checks.map((c: any) => (
                  <li key={c.key} className={c.ok ? 'text-[#2f6f28]' : 'text-red-700'}>
                    {c.ok ? '✓' : '×'} {c.label}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="lg:col-span-5">
            <div className="p-6 rounded-3xl crystal-card space-y-4 sticky top-24">
              <h3 className="font-display font-extrabold">{t('market.subscribe')}</h3>
              <p className="text-sm font-bold">{statusLabel}</p>
              <p className="text-sm text-neutral-600">
                {formatInt(live.raised ?? listing.raisedUsdc)} / {formatInt(d.offeringHardCapUsdc)} {unit} · mínimo {formatInt(d.minInvestmentUsdc || d.pricePerShareUsdc)} {unit}
              </p>
              {typeof live.investorRwa === 'number' && (
                <p className="text-xs text-neutral-500 font-mono">RWA on-chain: {live.investorRwa}</p>
              )}
              <input
                type="number"
                min={d.minInvestmentUsdc || d.pricePerShareUsdc}
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value))}
                className="w-full px-3 py-3 rounded-xl border border-black/10 font-mono"
              />
              {listing.status === 'CLOSED_SUCCESS' && (
                <p className="text-sm text-[#2f6f28] font-bold">{xlm ? t('market.closedSuccess') : t('market.closed')}</p>
              )}
              {listing.status === 'CLOSED_FAILED' && (
                <p className="text-sm text-red-800 font-bold">{t('market.closedFailed')}</p>
              )}
              {listing.status === 'LISTED' && (
                <p className="text-sm text-neutral-600">
                  {xlm
                    ? t('market.closesAtXlm', { n: formatInt(d.offeringHardCapUsdc) })
                    : t('market.closesAt', { n: formatInt(d.offeringSoftCapUsdc) })}
                </p>
              )}
              {xlm && (
                <div className="space-y-1">
                  <p className="text-xs text-neutral-500">{t('market.payoutHint')}</p>
                  <p className="text-xs text-neutral-500">{t('market.autoSettle')}</p>
                  {live.fiduciary && (
                    <p className="text-[11px] font-mono break-all text-neutral-500">
                      {t('market.payoutTo')} {live.fiduciary}
                    </p>
                  )}
                  {typeof live.fiduciaryXlm === 'number' && (
                    <p className="text-[11px] text-neutral-500">
                      {t('market.payoutBalance', { n: live.fiduciaryXlm.toFixed(4) })}
                    </p>
                  )}
                  {live.fiduciaryMismatch && (
                    <p className="text-[11px] text-red-800 font-bold">{t('market.payoutMismatch')}</p>
                  )}
                </div>
              )}
              {user?.kycStatus === 'APPROVED' && !user?.trustlines?.includes(listing.id) && (
                <button
                  type="button"
                  onClick={() => approveToken(listing.id).then(() => setNotice(t('market.approvedNotice'))).catch((e) => setNotice(e.message))}
                  className="w-full py-3 rounded-2xl border border-black/10 font-display font-bold"
                >
                  {t('market.approve')}
                </button>
              )}
              {canClaim && (
                <div className="space-y-2">
                  <p className="text-xs text-neutral-500">{t('market.claimHint')}</p>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => claimTokens(listing.id).then(() => setNotice(t('market.claimedNotice'))).catch((e) => setNotice(e.message))}
                    className="w-full py-3 rounded-2xl border border-black/10 font-display font-bold"
                  >
                    {t('market.claim')}
                  </button>
                </div>
              )}
              {canRefund && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={runRefund}
                  className="w-full py-3 rounded-2xl border border-black/10 font-display font-bold"
                >
                  {busy ? t('market.refundBusy') : t('market.refund')}
                </button>
              )}
              {holding?.refundedAt && (
                <p className="text-sm text-[#2f6f28] font-bold">{t('dash.refunded')}</p>
              )}
              {user?.kycStatus !== 'APPROVED' && (
                <p className="text-sm text-neutral-600">
                  {t('market.kycOnly')}{' '}
                  <Link href="/login" className="underline font-bold">{t('nav.login')}</Link>
                </p>
              )}
              <button
                type="button"
                onClick={invest}
                disabled={busy || user?.kycStatus !== 'APPROVED' || listing.status !== 'LISTED'}
                className="w-full py-3 rounded-2xl bg-black text-white font-display font-bold disabled:opacity-40"
              >
                {busy ? '…' : xlm ? t('market.contributeXlm') : t('market.contribute')}
              </button>
              {xlm && listing.status === 'LISTED' && (
                <button
                  type="button"
                  onClick={runFinalize}
                  disabled={busy || !canFinalize}
                  className="w-full py-3 rounded-2xl border border-black/10 font-display font-bold disabled:opacity-40"
                >
                  {busy ? t('market.finalizeBusy') : t('market.finalize')}
                </button>
              )}
              {notice && <p className="text-sm">{notice}</p>}
              {listing.onChain?.explorer && (
                <a
                  href={listing.onChain.explorer}
                  target="_blank"
                  rel="noreferrer"
                  className="block text-xs font-mono underline break-all"
                >
                  {t('market.contract')}
                </a>
              )}
              {listing.onChain?.contributeExplorer && (
                <a
                  href={listing.onChain.contributeExplorer}
                  target="_blank"
                  rel="noreferrer"
                  className="block text-xs font-mono underline break-all"
                >
                  {t('market.contributeTx')}
                </a>
              )}
              {listing.onChain?.finalizeExplorer && (
                <a
                  href={listing.onChain.finalizeExplorer}
                  target="_blank"
                  rel="noreferrer"
                  className="block text-xs font-mono underline break-all"
                >
                  {t('market.finalizeTx')}
                </a>
              )}
              {lastHash?.explorer && (
                <a
                  href={lastHash.explorer}
                  target="_blank"
                  rel="noreferrer"
                  className="block text-xs font-mono underline break-all"
                >
                  {lastHash.kind === 'finalize'
                    ? t('market.finalizeTx')
                    : lastHash.kind === 'refund'
                      ? t('market.refundTx')
                      : lastHash.kind === 'contribute'
                        ? t('market.contributeTx')
                        : t('market.trustline')}
                  {': '}
                  {lastHash.hash}
                </a>
              )}
              {listing.onChain?.trustlineExplorer && (
                <a
                  href={listing.onChain.trustlineExplorer}
                  target="_blank"
                  rel="noreferrer"
                  className="block text-xs font-mono underline break-all"
                >
                  {t('market.trustline')}
                </a>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!loaded) {
    return <p className="py-16 text-center text-neutral-500">{t('market.loading')}</p>;
  }
  return <p className="py-16 text-center text-neutral-500">{t('market.missing')}</p>;
}
