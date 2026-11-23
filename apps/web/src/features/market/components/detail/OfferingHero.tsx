import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { WireframeAsset } from '@/components/ui/kit';
import type { ListingDetail } from '@/core/api/types';
import { useI18n } from '@/hooks/useI18n';
import type { OfferingPhase } from '../../model';
import PhaseChip from '@/components/ui/PhaseChip';

/** Title block: back link, state chips, the issuer and what is being offered. */
export default function OfferingHero({
  listing,
  phase,
}: {
  listing: ListingDetail;
  phase: OfferingPhase | null;
}) {
  const { t } = useI18n();
  const d = listing.dossier;
  return (
    <header className="relative min-w-0">
      <a href="/market" className="btn btn-ghost btn-sm -ml-3 text-ink-2">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        {t('offerings.detail.back')}
      </a>
      <div className="mt-4 flex flex-wrap items-center gap-1.5">
        {phase && <PhaseChip phase={phase} />}
        {d.sector && <span className="chip chip-neutral">{d.sector}</span>}
        {d.cnvRecordId && (
          <span className="chip chip-sky">
            <ShieldCheck className="h-3 w-3" aria-hidden="true" />
            {t('offerings.detail.regulated', { id: d.cnvRecordId })}
          </span>
        )}
      </div>
      <h1 className="mt-4 text-[30px] font-normal leading-tight tracking-[-0.025em] text-ink sm:text-[40px]">
        {d.legalName}
      </h1>
      <p className="mt-2 max-w-2xl text-[15px] text-ink-2">
        {t('offerings.detail.terms.instrumentValue', { code: d.tokenTicker })}
        {d.isin ? ` · ISIN ${d.isin}` : ''}
        {d.jurisdiction ? ` · ${d.jurisdiction}` : ''}
      </p>
      <WireframeAsset className="pointer-events-none absolute -top-6 right-0 hidden w-[300px] opacity-70 xl:block" />
    </header>
  );
}
