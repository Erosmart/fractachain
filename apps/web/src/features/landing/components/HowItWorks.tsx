import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { withIsland } from '@/components/island/withIsland';
import { PillTabs } from '@/components/ui/kit';
import { useI18n } from '@/hooks/useI18n';

type Audience = 'investor' | 'issuer';

/** Four numbered steps with an investors / issuers switch. */
function HowItWorks() {
  const { t, messages } = useI18n();
  const [audience, setAudience] = useState<Audience>('investor');
  const steps =
    audience === 'investor' ? messages.landing.how.investorSteps : messages.landing.how.issuerSteps;

  return (
    <div className="space-y-6">
      <PillTabs
        label={t('landing.how.toggleLabel')}
        active={audience}
        onChange={(key) => setAudience(key as Audience)}
        items={[
          { key: 'investor', label: t('landing.how.investor') },
          { key: 'issuer', label: t('landing.how.issuer') },
        ]}
      />
      <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-live="polite">
        {steps.map(([title, body], i) => (
          <li key={`${audience}-${title}`} className="card card-pad flex min-w-0 flex-col animate-fade-up">
            <span className="chip-navy w-fit">{String(i + 1).padStart(2, '0')}</span>
            <h3 className="mt-6 text-[17px] font-medium leading-snug text-ink">{title}</h3>
            <p className="mt-2 text-sm text-ink-2">{body}</p>
          </li>
        ))}
      </ol>
      <p className="flex items-center gap-2 text-sm text-ink-2">
        <ShieldCheck className="h-4 w-4 shrink-0 text-good" aria-hidden="true" />
        {t('landing.how.guarantee')}
      </p>
    </div>
  );
}

export default withIsland(HowItWorks);
