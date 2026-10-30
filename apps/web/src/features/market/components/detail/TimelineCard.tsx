import { Check } from 'lucide-react';
import { Card } from '@/components/ui/kit';
import type { ListingDetail } from '@/core/api/types';
import { useI18n } from '@/hooks/useI18n';

interface Step {
  key: string;
  at: number | null;
  /** Future milestone with a known date (scheduled close). */
  scheduled?: boolean;
}

/** Milestones from filing to the company getting paid; done ones in ink, pending ones muted. */
export default function TimelineCard({
  listing,
  deadlineMs,
}: {
  listing: ListingDetail;
  deadlineMs: number | null;
}) {
  const { t, locale } = useI18n();
  const ms = (iso?: string) => (iso ? new Date(iso).getTime() : null);
  const closed = ms(listing.closedAt) ?? ms(listing.finalizeAt);
  const steps: Step[] = [
    { key: 'created', at: ms(listing.createdAt) },
    { key: 'deployed', at: ms(listing.deployedAt) },
    { key: 'minted', at: ms(listing.mintedAt) },
    { key: 'listed', at: ms(listing.listedAt) },
    closed ? { key: 'closed', at: closed } : { key: 'deadline', at: deadlineMs, scheduled: true },
    { key: 'paid', at: ms(listing.proceedsPaidAt) },
  ];
  const now = Date.now();
  const fmt = (at: number) =>
    new Date(at).toLocaleDateString(locale === 'en' ? 'en-US' : 'es-AR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });

  return (
    <Card title={t('offerings.detail.timeline.title')}>
      <ol className="relative">
        {steps.map((s, i) => {
          const done = s.at !== null && !s.scheduled && s.at <= now;
          const last = i === steps.length - 1;
          return (
            <li key={s.key} className="relative flex gap-3.5 pb-5 last:pb-0">
              {!last && (
                <span
                  className={`absolute left-[11px] top-6 h-[calc(100%-1.5rem)] w-px ${done ? 'bg-ink/40' : 'bg-line-strong'}`}
                  aria-hidden="true"
                />
              )}
              <span
                className={`relative z-10 mt-0.5 grid h-[23px] w-[23px] shrink-0 place-items-center rounded-full ${
                  done ? 'bg-navy text-navy-ink' : 'border border-dashed border-line-strong bg-surface'
                }`}
                aria-hidden="true"
              >
                {done && <Check className="h-3 w-3" strokeWidth={3} />}
              </span>
              <div className="min-w-0 flex-1 sm:flex sm:items-baseline sm:justify-between sm:gap-4">
                <p className={`text-sm ${done ? 'font-medium text-ink' : 'text-ink-2'}`}>
                  {t(`offerings.detail.timeline.${s.key}`)}
                  <span className="sr-only">
                    {' '}
                    ({done ? t('offerings.detail.timeline.done') : t('offerings.detail.timeline.pending')})
                  </span>
                </p>
                <p className="text-xs text-muted tnum">
                  {s.at ? fmt(s.at) : t('offerings.detail.timeline.pending')}
                </p>
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
