import { ChevronDown } from 'lucide-react';
import { Card, RiskCallout } from '@/components/ui/kit';
import { useI18n } from '@/hooks/useI18n';

/** Short warning always visible, the long one behind a disclosure. Anchor target of the risk checkbox. */
export default function RisksCard() {
  const { t } = useI18n();
  return (
    <section id="riesgos" className="scroll-mt-24">
      <Card title={t('offerings.detail.risks.title')} as="div">
        <RiskCallout>{t('offerings.detail.risks.short')}</RiskCallout>
        <details className="group mt-3">
          <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-md text-sm font-medium text-ink [&::-webkit-details-marker]:hidden">
            {t('offerings.detail.risks.more')}
            <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden="true" />
          </summary>
          <p className="mt-2 text-sm leading-relaxed text-ink-2">{t('offerings.detail.risks.long')}</p>
        </details>
        <p className="mt-4 text-xs text-muted">{t('offerings.detail.risks.demo')}</p>
      </Card>
    </section>
  );
}
