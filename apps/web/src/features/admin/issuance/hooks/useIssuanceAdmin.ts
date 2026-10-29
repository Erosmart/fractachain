import { useCallback, useEffect, useRef, useState } from 'react';
import type { Listing, SettlePolicy } from '@fractachain/shared';
import type { ListingAction } from '@/core/api/AdminApi';
import type { MervalStock, NewStockInput } from '@/core/api/types';
import { container } from '@/core/container';
import { errorMessage } from '@/core/errors';
import { useI18n } from '@/hooks/useI18n';
import { useSession } from '@/hooks/useSession';
import { toDatetimeLocal } from '../../shared/datetime';
import { EMPTY_DOSSIER, looksLikeStellarAccount, type DossierForm } from '../model';

const { api } = container;

/**
 * State and use cases of the issuer console, kept out of the view so the
 * components only render and dispatch.
 */
export function useIssuanceAdmin() {
  const { user } = useSession();
  const sessionId = user?.id ?? null;
  const { t } = useI18n();
  const [form, setForm] = useState<DossierForm>(EMPTY_DOSSIER);
  const [listings, setListings] = useState<Listing[]>([]);
  const [stocks, setStocks] = useState<MervalStock[]>([]);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [settlePolicy, setSettlePolicy] = useState<SettlePolicy>('ON_MIN');
  const [settleAt, setSettleAt] = useState('');
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (flashTimer.current) clearTimeout(flashTimer.current);
  }, []);

  const flash = useCallback((message: string) => {
    setNotice(message);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setNotice(''), 5000);
  }, []);

  const load = useCallback(async () => {
    const [ls, st] = await Promise.all([api.admin.listings().catch(() => null), api.admin.stocks().catch(() => null)]);
    if (ls) setListings(ls);
    if (st) setStocks(st);
  }, []);

  useEffect(() => {
    if (!sessionId) return;
    void load();
    api.admin
      .testnet()
      .then((data) => {
        if (!data) return;
        setSettlePolicy(data.settlePolicy === 'ON_DATE' ? 'ON_DATE' : 'ON_MIN');
        if (data.settleAt) setSettleAt(toDatetimeLocal(data.settleAt));
        // Prefer the issuer the backend can actually sign for: a listing issued
        // by an account we cannot sign for can never reach holders' wallets.
        const issuer = data.activeIssuer || data.deployment?.issuer;
        if (issuer) setForm((f) => (f.issuerPublicKey ? f : { ...f, issuerPublicKey: issuer }));
      })
      .catch(() => undefined);
  }, [sessionId, load]);

  const setField = useCallback(<K extends keyof DossierForm>(key: K, value: DossierForm[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
  }, []);

  const settleBody = () => ({ settlePolicy, settleAt: settlePolicy === 'ON_DATE' ? settleAt : undefined });

  /** One-click demo dossier: the backend fills every field with valid dummy data. */
  const fillDemo = async () => {
    setBusy('demo');
    try {
      const data = await api.admin.demoDossier();
      setForm((f) => ({ ...f, ...(data.dossier as Partial<DossierForm>) }));
      flash(
        `${t('admIss.demoLoaded', { pk: data.treasury.publicKey.slice(0, 8) })} ` +
          `${data.treasury.funded ? t('admIss.demoFunded') : t('admIss.demoNoFund')}`,
      );
    } catch (err) {
      flash(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const createListing = async () => {
    if (!looksLikeStellarAccount(form.proceedsWallet)) {
      flash(t('admIss.flashWalletReq'));
      return;
    }
    setBusy('create');
    try {
      const data = await api.admin.createListing({
        ...form,
        tokenTicker: form.tokenTicker || `t${form.ticker}`,
        estatutoHash: form.estatutoHash || `0x${Date.now().toString(16)}estatuto`,
      });
      flash(t('admIss.flashCreated', { id: data.id }));
      void load();
    } catch (err) {
      flash(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const act = async (id: string, action: ListingAction, body?: unknown) => {
    setBusy(`${id}:${action}`);
    try {
      const data = await api.admin.listingAction(id, action, body);
      const hash = data.onChain?.hash;
      flash(`${t('admIss.flashAct', { path: action, status: String(data.status ?? '') })}${hash ? ` · ${hash}` : ''}`);
      void load();
    } catch (err) {
      flash(errorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const saveProceedsWallet = (id: string, wallet: string) => act(id, 'proceeds-wallet', { wallet });

  const openLicitacion = async (id: string, wallet: string) => {
    if (!looksLikeStellarAccount(wallet)) {
      flash(t('admIss.flashOpenWallet'));
      return false;
    }
    try {
      await api.admin.listingAction(id, 'proceeds-wallet', { wallet: wallet.trim() });
      await act(id, 'licitacion', settleBody());
      return true;
    } catch (err) {
      flash(errorMessage(err));
      return false;
    }
  };

  const saveSettle = (id: string) => act(id, 'settle', settleBody());

  const closeListing = (listing: Listing) => act(listing.id, listing.dossier.paymentKind === 'XLM' ? 'finalize' : 'close');

  const payDividend = async (id: string, amountUsdc: number) => {
    try {
      const data = await api.admin.payDividend(id, amountUsdc);
      flash(t('admIss.flashDividend', { id: data.id, total: data.totalUsdc, n: data.holdersPaid, per: data.perShare }));
      void load();
    } catch (err) {
      flash(errorMessage(err));
    }
  };

  const emitStock = async (stock: NewStockInput) => {
    try {
      const data = await api.admin.createStock({ ...stock, tokenTicker: stock.tokenTicker || `t${stock.ticker}` });
      flash(t('admIss.flashStock', { t: data.tokenTicker }));
      void load();
      return true;
    } catch (err) {
      flash(errorMessage(err));
      return false;
    }
  };

  const toggleStock = async (ticker: string, active: boolean) => {
    try {
      await api.admin.setStockActive(ticker, active);
      flash(t(active ? 'admIss.flashOn' : 'admIss.flashOff', { t: ticker }));
      void load();
    } catch (err) {
      flash(errorMessage(err));
    }
  };

  return {
    form,
    setField,
    listings,
    stocks,
    notice,
    busy,
    settlePolicy,
    setSettlePolicy,
    settleAt,
    setSettleAt,
    fillDemo,
    createListing,
    act,
    saveProceedsWallet,
    openLicitacion,
    saveSettle,
    closeListing,
    payDividend,
    emitStock,
    toggleStock,
  };
}

export type IssuanceAdmin = ReturnType<typeof useIssuanceAdmin>;
