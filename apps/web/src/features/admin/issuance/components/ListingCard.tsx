import { useState } from 'react';
import type { Listing } from '@fractachain/shared';
import ExternalLink from '@/components/ui/ExternalLink';
import { explorerTx } from '@/core/format/number';
import { useI18n } from '@/hooks/useI18n';
import type { IssuanceAdmin } from '../hooks/useIssuanceAdmin';

interface ListingCardProps {
  listing: Listing;
  admin: IssuanceAdmin;
  mintAmount: number;
  onMintAmount: (n: number) => void;
  dividendAmount: number;
  onDividendAmount: (n: number) => void;
}

/** Steps 2–4 for one listing: payout wallet, deploy, mint, open, close, dividends. */
export default function ListingCard({ listing: l, admin, mintAmount, onMintAmount, dividendAmount, onDividendAmount }: ListingCardProps) {
  const { t } = useI18n();
  const { busy } = admin;
  const [wallet, setWallet] = useState(l.dossier.proceedsWallet || '');
  const walletEditable = !(l.raisedUsdc > 0);

  return (
    <article className="p-5 rounded-3xl crystal-card space-y-3">
      <div className="flex flex-wrap justify-between gap-2">
        <div>
          <div className="font-display font-extrabold">
            {l.dossier.tokenTicker} · {l.dossier.legalName}
          </div>
          <div className="text-xs text-neutral-500 font-mono">
            {l.id} · {l.status}
          </div>
        </div>
        <div className="text-xs text-neutral-600">
          {t('admIss.mintedRaised', { a: l.tokensMinted, b: l.dossier.sharesToTokenize, r: l.raisedUsdc })}
          <div>
            {l.settlePolicy === 'ON_DATE'
              ? t('admIss.distDate', { d: l.settleAt ? new Date(l.settleAt).toLocaleString() : '—' })
              : t('admIss.distMin')}
          </div>
        </div>
      </div>
      {l.stockContract && <p className="text-[11px] font-mono break-all">stock {l.stockContract}</p>}
      {l.licitacionContract && (
        <p className="text-[11px] font-mono break-all">
          {t('admIss.licitacionContract')} {l.licitacionContract}
        </p>
      )}
      {l.finalizeHash && (
        <p className="text-[11px] font-mono break-all">
          finalize{' '}
          <ExternalLink href={explorerTx(l.finalizeHash)} className="underline">
            {l.finalizeHash}
          </ExternalLink>
        </p>
      )}
      <p className="text-xs text-neutral-600">
        {t('admIss.paysTo')} <span className="font-mono break-all">{l.dossier.proceedsWallet || t('admIss.notConfigured')}</span>
        {l.proceedsPaidAt
          ? ` · ${t('admIss.paidAt', { d: new Date(l.proceedsPaidAt).toLocaleString() })}`
          : l.status === 'CLOSED_SUCCESS'
            ? ` · ${t('admIss.closedNoPay')}`
            : ` · ${t('admIss.paysOnClose')}`}
      </p>
      {walletEditable && (
        <div className="flex flex-wrap gap-2 items-center">
          <input
            placeholder={t('admIss.walletPh')}
            aria-label={t('admIss.walletPh')}
            value={wallet}
            onChange={(e) => setWallet(e.target.value)}
            className="flex-1 min-w-[16rem] px-3 py-2 rounded-xl border border-black/10 text-xs font-mono"
          />
          <button
            type="button"
            onClick={() => admin.saveProceedsWallet(l.id, wallet)}
            className="px-3 py-2 rounded-xl border border-black/10 text-xs font-bold"
          >
            {t('admIss.saveWallet')}
          </button>
        </div>
      )}
      <div className="flex flex-wrap gap-2 items-center">
        <button
          type="button"
          onClick={() => admin.act(l.id, 'deploy')}
          disabled={Boolean(busy)}
          className="px-3 py-2 rounded-xl bg-black text-white text-xs font-bold disabled:opacity-40"
        >
          {busy === `${l.id}:deploy` ? t('admIss.deploying') : t('admIss.deploy')}
        </button>
        <input
          type="number"
          aria-label={t('admIss.mint')}
          className="w-28 px-2 py-2 rounded-xl border border-black/10 text-sm"
          value={mintAmount}
          onChange={(e) => onMintAmount(Number(e.target.value))}
          onFocus={(e) => e.target.select()}
        />
        <button
          type="button"
          onClick={() => admin.act(l.id, 'mint', { amount: mintAmount })}
          disabled={Boolean(busy)}
          className="px-3 py-2 rounded-xl border border-black/10 text-xs font-bold disabled:opacity-40"
        >
          {busy === `${l.id}:mint` ? t('admIss.minting') : t('admIss.mint')}
        </button>
        <button
          type="button"
          onClick={() => admin.openLicitacion(l.id, walletEditable ? wallet : l.dossier.proceedsWallet || '')}
          disabled={Boolean(busy)}
          className="px-3 py-2 rounded-xl border border-black/10 text-xs font-bold disabled:opacity-40"
        >
          {busy === `${l.id}:licitacion` ? t('admIss.opening') : t('admIss.open')}
        </button>
        {l.status === 'LISTED' && (
          <>
            <button
              type="button"
              onClick={() => admin.saveSettle(l.id)}
              disabled={Boolean(busy)}
              className="px-3 py-2 rounded-xl border border-black/10 text-xs font-bold disabled:opacity-40"
            >
              {t('admIss.saveSettle')}
            </button>
            <button
              type="button"
              onClick={() => admin.closeListing(l)}
              disabled={Boolean(busy)}
              className="px-3 py-2 rounded-xl border border-black/10 text-xs font-bold disabled:opacity-40"
            >
              {l.dossier.paymentKind === 'XLM' ? t('admIss.finalizeXlm') : t('admIss.closeNow', { n: l.dossier.offeringSoftCapUsdc })}
            </button>
          </>
        )}
        <a href={`/market/${encodeURIComponent(l.id)}`} className="px-3 py-2 text-xs font-bold underline">
          {t('admIss.publicPage')}
        </a>
      </div>
      {l.status === 'CLOSED_SUCCESS' && (
        <div className="flex flex-wrap gap-2 items-center pt-2 border-t border-black/10">
          <span className="text-xs font-bold">{t('admIss.payDividend')}</span>
          <input
            type="number"
            aria-label={t('admIss.payDividend')}
            className="w-32 px-2 py-2 rounded-xl border border-black/10 text-sm"
            value={dividendAmount}
            onChange={(e) => onDividendAmount(Number(e.target.value))}
            onFocus={(e) => e.target.select()}
          />
          <span className="text-xs text-neutral-500">{t('admIss.proRata')}</span>
          <button type="button" onClick={() => admin.payDividend(l.id, dividendAmount)} className="px-3 py-2 rounded-xl bg-black text-white text-xs font-bold">
            {t('admIss.depositSplit')}
          </button>
        </div>
      )}
    </article>
  );
}
