import { useCallback, useEffect, useMemo, useState } from 'react';
import type { OrderSide } from '@fractachain/shared';
import type { Market } from '@/core/api/types';
import { container } from '@/core/container';
import { errorMessage } from '@/core/errors';
import { explorerTx } from '@/core/format/number';
import { isVisibleListing } from '@/core/market/listings';
import { useAuth } from '@/hooks/useAuth';
import { useI18n } from '@/hooks/useI18n';
import { useVisibleInterval } from '@/hooks/useVisibleInterval';
import { humanizeError } from '@/features/market/components/OpStatus';
import { fromSandbox, fromSdex, type Book, type MyOrder } from '../model';

const { api, wallet, navigator } = container;

export interface OrderTx {
  state: 'signing' | 'pending' | 'confirmed' | 'done' | 'failed';
  message: string;
  hash?: string | null;
  detail?: string;
}

/**
 * Secondary market state: the markets, the selected book (Stellar DEX when
 * the listing trades there, the local matcher otherwise), balances and the
 * order actions.
 */
export function useOrderBook() {
  const { t } = useI18n();
  const { user, refreshUser, approveToken } = useAuth();
  const [markets, setMarkets] = useState<Market[] | null>(null);
  const [listingId, setListingId] = useState(() => navigator.searchParam('listing') || '');
  const [book, setBook] = useState<Book | null>(null);
  const [tx, setTx] = useState<OrderTx | null>(null);
  const [busy, setBusy] = useState(false);

  const holding = user?.holdings?.find((h) => h.listingId === listingId);
  const onSdex = book?.venue === 'sdex';
  const selfCustody = user?.custodyMode === 'SELF';

  // On SDEX the ledger is the authority: the trustline's authorized flag is
  // what decides whether Stellar accepts the order.
  const approved = onSdex ? Boolean(book?.authorized) : user?.kycStatus === 'APPROVED';

  /**
   * Prefers the real Stellar order book and falls back to the local matcher.
   * SDEX only answers for listings that already have an issuing account on
   * the network, so a demo without testnet keys still gets a working book.
   */
  const loadBook = useCallback(async (id: string) => {
    if (!id) return;
    try {
      setBook(fromSdex(await api.market.sdexBook(id)));
      return;
    } catch {
      // not on SDEX (or Horizon down): use the sandbox book
    }
    try {
      setBook(fromSandbox(await api.market.sandboxBook(id)));
    } catch {
      // keep the last book on screen until the next poll
    }
  }, []);

  useEffect(() => {
    api.market
      .markets()
      .then((rows) => setMarkets(rows.filter((m) => isVisibleListing(m.listingId))))
      .catch(() => setMarkets([]));
  }, []);

  useEffect(() => {
    if (!listingId && markets?.[0]) setListingId(markets[0].listingId);
  }, [markets, listingId]);

  const selectMarket = (id: string) => {
    setListingId(id);
    setBook(null);
    setTx(null);
  };

  useVisibleInterval(() => loadBook(listingId), 4000, Boolean(listingId), `${listingId}:${user?.id ?? ''}`);

  const openOrders = useMemo(
    () => (book?.myOrders || []).filter((o) => o.status === 'OPEN' || o.status === 'PARTIAL'),
    [book?.myOrders],
  );

  // The backend reserves cash against resting buys in every market, so take
  // its numbers rather than deriving them from this listing's orders.
  const reservedCash = book?.reservedCash ?? 0;
  const reservedTokens = book?.reservedTokens ?? 0;

  // SDEX: spendable balances are on-chain (the backend nets out offer
  // liabilities). Sandbox: platform ledger minus what resting orders reserve.
  const freeCash = onSdex
    ? Number(book?.usdcBalance || 0)
    : Math.max(0, Number(book?.demoCash || 0) - reservedCash);
  const freeTokens = onSdex
    ? Number(book?.tokenBalance || 0)
    : Math.max(0, Number(holding?.tokens || 0) - reservedTokens);
  const lockedCash = onSdex ? Math.max(0, Number(book?.usdcTotal || 0) - freeCash) : reservedCash;
  const lockedTokens = onSdex ? Math.max(0, Number(book?.tokenTotal || 0) - freeTokens) : reservedTokens;

  const needsTrustline = (side: OrderSide) =>
    onSdex
      ? Boolean(book?.needsTrustline)
      : side === 'BUY' && approved && !user?.trustlines?.includes(listingId);

  /** Relays a transaction the investor already signed (self-custody paths). */
  const submitSigned = (xdr: string) => api.market.submitSdex(xdr);

  const place = async (order: { side: OrderSide; price: number; amount: number }): Promise<boolean> => {
    setBusy(true);
    setTx({ state: 'pending', message: t('markets.tx.pending') });
    try {
      if (onSdex && selfCustody) {
        // The order leaves from the investor's wallet: Freighter signs it and
        // the backend only relays it.
        setTx({ state: 'signing', message: t('markets.tx.signInFreighter') });
        const prepared = await api.market.prepareSdexOrder(listingId, order);
        const relayed = await submitSigned(await wallet.signer.signTransaction(prepared.xdr));
        await refreshUser();
        await loadBook(listingId);
        setTx({ state: 'confirmed', message: t('markets.tx.sent'), hash: relayed?.hash ?? null });
        return true;
      }
      if (onSdex) {
        const data = await api.market.placeSdexOrder(listingId, order);
        await refreshUser();
        setBook(fromSdex(data.book));
        setTx({ state: 'confirmed', message: t('markets.tx.sent'), hash: data.hash ?? null });
        return true;
      }
      const data = await api.market.placeSandboxOrder(listingId, order);
      await refreshUser();
      setBook(fromSandbox(data.book));
      setTx({
        state: 'done',
        message: data.order.status === 'FILLED' ? t('markets.tx.filled') : t('markets.tx.resting'),
      });
      return true;
    } catch (err) {
      setTx({
        state: 'failed',
        ...humanizeError(errorMessage(err, t('markets.tx.fail')), t('markets.tx.rejected')),
      });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const cancel = async (order: MyOrder) => {
    setBusy(true);
    try {
      if (book?.venue === 'sdex') {
        // On SDEX a cancel is an offer for zero: it needs the original side
        // and price to find and zero out the resting offer.
        const data = await api.market.cancelSdexOrder(listingId, {
          side: order.side,
          offerId: order.id,
          price: order.price,
          legacy: order.legacy,
        });
        // Custodial: already submitted by the backend. Self-custody: sign and relay.
        let hash = data?.hash ?? null;
        if (data?.xdr) {
          setTx({ state: 'signing', message: t('markets.tx.signInFreighter') });
          hash = (await submitSigned(await wallet.signer.signTransaction(data.xdr)))?.hash ?? null;
        }
        await loadBook(listingId);
        void refreshUser();
        setTx({ state: hash ? 'confirmed' : 'done', message: t('markets.tx.cancelled'), hash });
        return;
      }
      const data = await api.market.cancelSandboxOrder(order.id);
      setBook(fromSandbox(data.book));
      void refreshUser();
      setTx({ state: 'done', message: t('markets.tx.cancelled') });
    } catch (err) {
      setTx({
        state: 'failed',
        ...humanizeError(errorMessage(err, t('markets.tx.cancelFail')), t('markets.tx.rejected')),
      });
    } finally {
      setBusy(false);
    }
  };

  const approve = async () => {
    const code = book?.tokenTicker ?? '';
    setBusy(true);
    try {
      await approveToken(listingId);
      setTx({ state: 'done', message: t('markets.tx.approved', { code }) });
      await loadBook(listingId);
    } catch (err) {
      setTx({ state: 'failed', ...humanizeError(errorMessage(err), t('markets.tx.rejected')) });
    } finally {
      setBusy(false);
    }
  };

  return {
    user,
    /** Visitors see the book read-only; trading needs an account. */
    signedIn: Boolean(user),
    markets,
    listingId,
    selectMarket,
    book,
    holding,
    onSdex,
    approved,
    needsTrustline,
    openOrders,
    freeCash,
    freeTokens,
    lockedCash,
    lockedTokens,
    tx,
    busy,
    explorer: (hash: string) => explorerTx(hash),
    actions: { place, cancel, approve },
  };
}

export type OrderBookState = ReturnType<typeof useOrderBook>;
