import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ChainPortfolio } from '@fractachain/shared';
import type { ListingActivity } from '@/core/api/ListingsApi';
import type { ListingDetail, ValidationPack } from '@/core/api/types';
import { container } from '@/core/container';
import { explorerTx } from '@/core/format/number';
import { useTxFlow } from '@/components/tx/useTxFlow';
import { useAuth } from '@/hooks/useAuth';
import { isContractId, tenderView, type TenderView } from '../chainModel';
import { offeringPhase, type OfferingPhase } from '../model';

export type ChainLoad = 'none' | 'loading' | 'ready' | 'error';

const { api } = container;

/**
 * The offering page. Descriptive copy (issuer, dossier, documents) comes from
 * the listing; every figure — state, raised, price, caps, deadline, the
 * investor's balances — is read from the tender contract (Instaward 1, D3).
 * Every on-chain action runs through the one transaction flow (D2):
 * Freighter for self-custody, the server-signed endpoints as the custodial
 * fallback.
 */
export function useOffering(listingId: string) {
  const auth = useAuth();
  const { user, refreshUser } = auth;
  const [listing, setListing] = useState<ListingDetail | null>(null);
  const [validation, setValidation] = useState<ValidationPack | null>(null);
  const [activity, setActivity] = useState<ListingActivity | null>(null);
  const [hasDividends, setHasDividends] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [tender, setTender] = useState<TenderView | null>(null);
  const [chainLoad, setChainLoad] = useState<ChainLoad>('loading');
  const [wallet, setWallet] = useState<ChainPortfolio | null>(null);
  const [usdcMode, setUsdcMode] = useState<'circle' | 'team' | null>(null);
  const sessionId = user?.id ?? null;
  const address = user?.publicKey || null;
  const selfCustody = user?.custodyMode === 'SELF';

  const contractId = isContractId(listing?.licitacionContract) ? listing!.licitacionContract : null;

  const loadListing = useCallback(async () => {
    const envelope = await api.listings.get(listingId);
    setListing(envelope.data);
    setValidation(envelope.validation);
    void api.listings
      .activity(listingId)
      .then(setActivity)
      .catch(() => setActivity(null));
    void api.listings
      .dividends(listingId)
      .then((rows) => setHasDividends(rows.length > 0))
      .catch(() => undefined);
    return envelope.data;
  }, [listingId]);

  const loadChain = useCallback(
    async (id: string | null) => {
      if (!id) {
        setTender(null);
        setChainLoad('none');
        return;
      }
      setChainLoad((s) => (s === 'ready' ? s : 'loading'));
      try {
        const data = await api.chain.tender(id, address || undefined);
        setTender(tenderView(data));
        setChainLoad('ready');
      } catch {
        // Never fall back to database figures: the page says the read failed.
        setChainLoad((s) => (s === 'ready' ? s : 'error'));
      }
      if (address) {
        void api.chain
          .portfolio(address)
          .then(setWallet)
          .catch(() => undefined);
      }
    },
    [address],
  );

  const reload = useCallback(async () => {
    const data = await loadListing().catch(() => null);
    await loadChain(isContractId(data?.licitacionContract) ? data!.licitacionContract : null);
  }, [loadListing, loadChain]);

  useEffect(() => {
    reload().finally(() => setLoaded(true));
  }, [reload, sessionId]);

  // Where test USDC comes from, for the funding helper's label.
  useEffect(() => {
    if (!address) return;
    void api.wallet
      .state(address)
      .then((s) => setUsdcMode(s.usdcMode ?? null))
      .catch(() => undefined);
  }, [address]);

  const flow = useTxFlow(() => {
    void reload();
    void refreshUser().catch(() => undefined);
  });

  const holding = listing ? user?.holdings?.find((h) => h.listingId === listing.id) : undefined;
  const code = tender?.code ?? '';
  const deadlineMs = tender?.deadlineMs ?? null;

  const phase: OfferingPhase | null = useMemo(() => {
    if (!listing) return null;
    if (!tender) return chainLoad === 'none' ? 'upcoming' : null;
    return offeringPhase({
      status: tender.status,
      stateName: tender.stateName,
      raised: tender.raised,
      softCap: tender.softCap ?? 0,
      hardCap: tender.hardCap ?? 0,
      deadlineMs,
      hasRefundableContribution: (tender.holder?.rwa ?? 0) > 0,
      hasDividends,
    });
  }, [listing, tender, chainLoad, deadlineMs, hasDividends]);

  /** Payment asset readiness in the investor's wallet (classic assets need a trustline). */
  const payment = useMemo(() => {
    const classic = Boolean(tender?.asset?.issuer);
    const usdc = wallet?.usdc;
    const sameAsset = usdc && tender && usdc.asset.contractId === tender.asset.contractId;
    return {
      classic,
      trustline: !classic || Boolean(sameAsset && usdc?.trustline),
      balance: tender?.holder ? tender.holder.payment : sameAsset ? usdc!.balance : null,
    };
  }, [tender, wallet]);

  const expected = address;

  const subscribe = (amount: number) =>
    selfCustody
      ? flow.prepare({ action: 'contribute', listingId, amount }, expected)
      : flow.custodial('contribute', async () => {
          const data = await api.listings.contribute(listingId, amount);
          const hash = data.onChain?.contributeHash || null;
          return { hash, explorer: data.onChain?.contributeExplorer || (hash ? explorerTx(hash) : null) };
        });

  const refund = () =>
    selfCustody
      ? flow.prepare({ action: 'refund', listingId }, expected)
      : flow.custodial('refund', async () => {
          const data = await api.listings.refund(listingId);
          const hash = data?.onChain?.hash ?? null;
          return { hash, explorer: data?.onChain?.explorer ?? (hash ? explorerTx(hash) : null) };
        });

  const finalize = () =>
    selfCustody
      ? flow.prepare({ action: 'finalize', listingId }, expected)
      : flow.custodial('finalize', async () => {
          const data = await api.listings.finalize(listingId);
          const hash = data?.onChain?.hash ?? null;
          return { hash, explorer: data?.onChain?.explorer ?? (hash ? explorerTx(hash) : null) };
        });

  /** Classic trustline to the payment asset (USDC): signed by the investor. */
  const enablePayment = () => flow.prepare({ action: 'usdc_trustline' }, expected);

  /** Reviewer funding helper: test USDC from the demo pool (server-side transfer). */
  const fund = () =>
    flow.custodial('fund', async () => {
      const res = await api.wallet.fundUsdc();
      const hash = res?.hash ?? null;
      return { hash, explorer: hash ? explorerTx(hash) : null };
    });

  /** Opt-in to the RWA token on the DEX (legacy relay; the wallet signs when self-custody). */
  const approve = () => flow.custodial('trustline', async () => void (await auth.approveToken(listingId)));

  const claim = () =>
    flow.custodial('distribute', async () => {
      const data = await auth.claimTokens(listingId);
      const hash = data?.distribution?.hash ?? null;
      if (data?.distribution?.error) throw new Error(data.distribution.error);
      return { hash, explorer: hash ? explorerTx(hash) : null };
    });

  const receive = () =>
    flow.custodial('distribute', async () => {
      const data = await auth.distributeTokens(listingId);
      const hash = data?.hash ?? null;
      return { hash, explorer: hash ? explorerTx(hash) : null };
    });

  return {
    user,
    listing,
    validation,
    activity,
    loaded,
    tender,
    chainLoad,
    contractId,
    code,
    holding,
    deadlineMs,
    phase,
    payment,
    usdcMode,
    selfCustody,
    flow,
    reloadChain: () => loadChain(contractId),
    actions: { subscribe, refund, finalize, enablePayment, fund, approve, claim, receive },
  };
}

export type Offering = ReturnType<typeof useOffering>;
