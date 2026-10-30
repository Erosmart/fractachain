import { ArrowLeftRight, Landmark, RotateCcw, ScanSearch } from 'lucide-react';
import { useI18n } from '@/hooks/useI18n';
import type { PaymentUnit } from '../../model';

/** Three to four product truths that hold for every offering on the platform. */
export default function WhyInvest({ unit }: { unit: PaymentUnit }) {
  const { t } = useI18n();
  const items = [
    { Icon: Landmark, title: 'backingTitle', body: 'backing' },
    { Icon: RotateCcw, title: 'refundTitle', body: 'refund' },
    { Icon: ScanSearch, title: 'settleTitle', body: 'settle' },
    { Icon: ArrowLeftRight, title: 'marketTitle', body: 'market' },
  ] as const;
  return (
    <section className="card card-pad" aria-labelledby="why-title">
      <h2 id="why-title" className="title">
        {t('offerings.detail.why.title')}
      </h2>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2">
        {items.map(({ Icon, title, body }) => (
          <li key={title} className="flex gap-3 rounded-2xl bg-surface-2 p-4">
            <span
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-sky-soft text-ink"
              aria-hidden="true"
            >
              <Icon className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink">{t(`offerings.detail.why.${title}`)}</p>
              <p className="mt-0.5 text-[13px] leading-relaxed text-ink-2">
                {t(`offerings.detail.why.${body}`, { u: unit })}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
