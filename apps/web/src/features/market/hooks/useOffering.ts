import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ListingActivity } from '@/core/api/ListingsApi';
import type { ChainActionResult, ListingDetail, ValidationPack } from '@/core/api/types';
import { container } from '@/core/container';
import { errorMessage } from '@/core/errors';
import { explorerTx } from '@/core/format/number';
import { ApiError } from '@/core/http/HttpClient';
import { useAuth } from '@/hooks/useAuth';
import { useI18n } from '@/hooks/useI18n';
import { humanizeError } from '../components/OpStatus';
import {
  listingDeadlineMs,
  money,
  offeringPhase,
  unitOf,
  type OfferingPhase,
  type OnChainSnapshot,
} from '../model';

export type TxKind = 'contribute' | 'trustline' | 'finalize' | 'refund' | 'distribute';
export type TxState = 'signing' | 'pending' | 'confirmed' | 'done' | 'failed';

export interface TxStatus {
  kind: TxKind;
  state: TxState;
  message: string;
  hash?: string | null;
  explorer?: string | null;
  detail?: string;
}

const { api, wallet } = container;

/**
 * The offering page's data and every investor action on it. Actions report
 * through one `tx` status (rendered in an aria-live region) and reload the
 * listing and the session afterwards.
 */
export function useOffering(listingId: string) {
  const auth = useAuth();
  const { user, refreshUser } = auth;
  const { t } = useI18n();
  const [listing, setListing] = useState<ListingDetail | null>(null);
  const [validation, setValidation] = useState<ValidationPack | null>(null);
  const [activity, setActivity] = useState<ListingActivity | null>(null);
  const [hasDividends, setHasDividends] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [tx, setTx] = useState<TxStatus | null>(null);
  const [busy, setBusy] = useState<TxKind | null>(null);
  const sessionId = user?.id ?? null;

  const load = useCallback(async () => {
    const envelope = await api.listings.get(listingId);
    setListing(envelope.data);
    setValidation(envelope.validation);
    // Secondary data: the page works without it.
    void api.listings
      .activity(listingId)
      .then(setActivity)
      .catch(() => setActivity(null));
    void api.listings
      .dividends(listingId)
      .then((rows) => setHasDividends(rows.length > 0))
      .catch(() => undefined);
  }, [listingId]);

  useEffect(() => {
    load()
      .catch(() => undefined)
      .finally(() => setLoaded(true));
  }, [load, sessionId]);

  const unit = unitOf(listing?.dossier?.paymentKind);
  const onChain = (listing?.onChain ?? {}) as OnChainSnapshot;
  const holding = listing ? user?.holdings?.find((h) => h.listingId === listing.id) : undefined;
  const deadlineMs = listing
    ? listingDeadlineMs(
        listing,
        validation?.offering && (validation.offering as { deadline?: unknown }).deadline,
      )
    : null;
  const raised = Number(onChain.raised ?? listing?.raisedUsdc ?? 0);

  const phase: OfferingPhase | null = useMemo(() => {
    if (!listing) return null;
    return offeringPhase({
      status: listing.status,
      stateName: onChain.stateName,
      raised,
      softCap: listing.dossier.offeringSoftCapUsdc,
      hardCap: listing.dossier.offeringHardCapUsdc,
      deadlineMs,
      hasRefundableContribution: Boolean(onChain.live && holding && !holding.refundedAt),
      hasDividends,
    });
  }, [listing, onChain.stateName, onChain.live, raised, deadlineMs, holding, hasDividends]);

  /** Runs an action with one status line; errors become a failed status, never a throw. */
  const run = async (kind: TxKind, action: () => Promise<Omit<TxStatus, 'kind'> | void>) => {
    if (!sessionId) {
      setTx({ kind, state: 'failed', message: t('offerings.tx.loginFirst') });
      return;
    }
    setBusy(kind);
    setTx({ kind, state: 'pending', message: t('offerings.tx.pending') });
    try {
      const result = await action();
      if (result) setTx({ kind, ...result });
      await Promise.all([load().catch(() => undefined), refreshUser().catch(() => undefined)]);
    } catch (err) {
      setTx(
        err instanceof ApiError && err.isNetwork
          ? { kind, state: 'failed', message: t('offerings.tx.apiDown') }
          : {
              kind,
              state: 'failed',
              ...humanizeError(errorMessage(err, t('offerings.tx.failed')), t('offerings.tx.rejected')),
            },
      );
    } finally {
      setBusy(null);
    }
  };

  const subscribe = (amount: number) =>
    run('contribute', async () => {
      let data: ListingDetail;
      if (onChain.live && user?.custodyMode === 'SELF') {
        // Own wallet: the contract needs the investor's signature; the backend
        // builds the invocation and Freighter signs it.
        setTx({ kind: 'contribute', state: 'signing', message: t('offerings.tx.signInFreighter') });
        data = await wallet.relay.signAndRelay<ListingDetail>({
          prepare: api.listings.contributePreparePath(listingId),
          submit: api.listings.contributeSubmitPath(listingId),
          body: { usdcAmount: amount },
        });
      } else {
        data = await api.listings.contribute(listingId, amount);
      }
      setListing(data);
      const hash = data.onChain?.contributeHash || data.onChain?.trustlineHash || null;
      const total = money(Number(data.onChain?.raised ?? data.raisedUsdc), unitOf(data.dossier?.paymentKind));
      return {
        state: hash ? 'confirmed' : 'done',
        message: t('offerings.tx.subscribed', { n: total }),
        hash,
        explorer:
          data.onChain?.contributeExplorer ||
          data.onChain?.trustlineExplorer ||
          (hash ? explorerTx(hash) : null),
      };
    });

  const approve = () =>
    run('trustline', async () => {
      await auth.approveToken(listingId);
      return { state: 'done', message: t('offerings.tx.approved') };
    });

  const claim = () =>
    run('distribute', async () => {
      const data: ChainActionResult = await auth.claimTokens(listingId);
      const dist = data?.distribution;
      if (dist?.hash) {
        return {
          state: 'confirmed',
          message: t('offerings.tx.claimed'),
          hash: dist.hash,
          explorer: explorerTx(dist.hash),
        };
      }
      if (dist?.error) return { state: 'failed', ...humanizeError(dist.error, t('offerings.tx.rejected')) };
      return { state: 'done', message: t('offerings.tx.claimed') };
    });

  const receive = () =>
    run('distribute', async () => {
      const data = await auth.distributeTokens(listingId);
      const code = listing?.dossier.tokenTicker ?? '';
      if (data?.hash) {
        return {
          state: 'confirmed',
          message: t('offerings.tx.received', { n: Number(data.amount ?? 0).toFixed(4), code }),
          hash: data.hash,
          explorer: explorerTx(data.hash),
        };
      }
      return { state: 'done', message: t('offerings.tx.claimed') };
    });

  const refund = () =>
    run('refund', async () => {
      const data = await auth.refundContribution(listingId, user?.custodyMode === 'SELF');
      const hash = data?.onChain?.hash ?? null;
      return {
        state: hash ? 'confirmed' : 'done',
        message: t('offerings.tx.refundDone'),
        hash,
        explorer: data?.onChain?.explorer ?? (hash ? explorerTx(hash) : null),
      };
    });

  const finalize = () =>
    run('finalize', async () => {
      const data = await auth.finalizeOffering(listingId);
      const hash = data?.onChain?.hash ?? null;
      return {
        state: hash ? 'confirmed' : 'done',
        message: t('offerings.tx.finalized'),
        hash,
        explorer: data?.onChain?.explorer ?? (hash ? explorerTx(hash) : null),
      };
    });

  return {
    user,
    listing,
    validation,
    activity,
    loaded,
    unit,
    onChain,
    holding,
    deadlineMs,
    raised,
    phase,
    tx,
    busy,
    actions: { subscribe, approve, claim, receive, refund, finalize },
  };
}

export type Offering = ReturnType<typeof useOffering>;
