import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { withIsland } from '@/components/island/withIsland';
import { EmptyState } from '@/components/ui/kit';
import { useI18n } from '@/hooks/useI18n';
import { useMediaQuery } from '../../hooks/useNow';
import { useOffering, type Offering } from '../../hooks/useOffering';
import { LIVE_PHASES, money } from '../../model';
import CloseCard from './CloseCard';
import DocumentsCard from './DocumentsCard';
import InvestBox from './InvestBox';
import IssuerCard from './IssuerCard';
import OfferingHero from './OfferingHero';
import OnChainCard from './OnChainCard';
import PositionCard from './PositionCard';
import RisksCard from './RisksCard';
import SubscriptionCurveCard from './SubscriptionCurveCard';
import TermsCard from './TermsCard';
import TimelineCard from './TimelineCard';
import WhyInvest from './WhyInvest';

/**
 * Phones: the subscription box lives in a bottom sheet opened from a fixed
 * bar ("Suscribir · mín. US$ 20"). Desktop: sticky right column.
 */
function InvestSheet({ offering }: { offering: Offering }) {
  const { t } = useI18n();
  const desktop = useMediaQuery('(min-width: 1024px)');
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const { listing, user, unit, phase } = offering;
  const d = listing!.dossier;
  const live = phase !== null && LIVE_PHASES.has(phase);

  useEffect(() => {
    if (desktop) setOpen(false);
  }, [desktop]);

  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLElement>('input, button, a[href]')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      opener.current?.focus();
    };
  }, [open]);

  // Nothing to subscribe to: the box is just the status summary, shown inline.
  if (desktop || !live) {
    return <InvestBox offering={offering} />;
  }

  return (
    <>
      {/* Above the app's bottom tab bar when signed in. */}
      <div
        className={`fixed inset-x-0 z-30 px-4 pb-3 lg:hidden ${user ? 'bottom-[calc(4rem+env(safe-area-inset-bottom))]' : 'bottom-[env(safe-area-inset-bottom)]'}`}
      >
        <button
          ref={opener}
          type="button"
          className="btn btn-primary btn-lg w-full shadow-lift"
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => setOpen(true)}
        >
          {live
            ? t('offerings.invest.mobileCta', {
                min: money(d.minInvestmentUsdc || d.pricePerShareUsdc, unit),
              })
            : t('offerings.invest.mobileClosed')}
        </button>
      </div>
      {/* Portaled: <main> is its own stacking context below the header and the tab bar. */}
      {open &&
        createPortal(
          <div className="fixed inset-0 z-[60] lg:hidden">
            <button
              type="button"
              className="absolute inset-0 h-full w-full cursor-default bg-ink/30 backdrop-blur-[2px]"
              aria-label={t('offerings.invest.close')}
              tabIndex={-1}
              onClick={() => setOpen(false)}
            />
            <div
              ref={panel}
              role="dialog"
              aria-modal="true"
              aria-label={t('offerings.invest.title')}
              className="absolute inset-x-0 bottom-0 max-h-[88vh] overflow-y-auto rounded-t-[1.5rem] bg-canvas p-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] animate-fade-up"
            >
              <InvestBox offering={offering} onClose={() => setOpen(false)} />
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

/** Offering page: the dossier on the left, the subscription box on the right. */
function MarketDetailPage({ listingId }: { listingId: string }) {
  const { t } = useI18n();
  const offering = useOffering(listingId);
  const { listing, validation, activity, unit, onChain, phase, deadlineMs, loaded } = offering;
  const live = phase !== null && LIVE_PHASES.has(phase);

  if (!listing) {
    return loaded ? (
      <div className="card mx-auto mt-6 max-w-xl">
        <EmptyState
          title={t('offerings.detail.missing')}
          body={t('offerings.detail.missingBody')}
          action={
            <a href="/market" className="btn btn-secondary btn-sm">
              {t('offerings.detail.back')}
            </a>
          }
        />
      </div>
    ) : (
      <p className="py-16 text-center text-sm text-muted" role="status">
        {t('offerings.detail.loading')}
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <OfferingHero listing={listing} phase={phase} />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_400px] xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="min-w-0 space-y-5">
          <div className="space-y-5 lg:hidden">
            <PositionCard offering={offering} />
            <CloseCard offering={offering} />
          </div>
          <WhyInvest unit={unit} />
          <SubscriptionCurveCard
            listing={listing}
            activity={activity}
            unit={unit}
            live={live}
            deadlineMs={deadlineMs}
          />
          <TermsCard listing={listing} validation={validation} unit={unit} />
          <IssuerCard listing={listing} />
          <div className="grid gap-5 xl:grid-cols-2">
            <TimelineCard listing={listing} deadlineMs={deadlineMs} />
            <DocumentsCard listing={listing} />
          </div>
          <RisksCard />
          <OnChainCard listing={listing} validation={validation} onChain={onChain} />
          {/* Room for the fixed subscribe bar on phones. */}
          {live && <div className="h-16 lg:hidden" aria-hidden="true" />}
        </div>
        <aside
          className={`min-w-0 lg:sticky lg:top-24 lg:order-none lg:self-start ${live ? '' : 'order-first'}`}
        >
          <div className="space-y-5">
            <InvestSheet offering={offering} />
            <div className="hidden space-y-5 lg:block">
              <PositionCard offering={offering} />
              <CloseCard offering={offering} />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

export default withIsland(MarketDetailPage);
