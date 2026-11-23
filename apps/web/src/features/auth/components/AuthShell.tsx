import type { ReactNode } from 'react';
import { Check } from 'lucide-react';
import { WireframeAsset } from '@/components/ui/kit';
import { useI18n } from '@/hooks/useI18n';

interface AuthShellProps {
  icon?: ReactNode;
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  /** Gradient side panel with the product promise (sign-in / sign-up only). */
  aside?: boolean;
}

/**
 * Focused layout for account flows: one card on the atmosphere background,
 * optionally next to the brand's gradient panel.
 */
export default function AuthShell({
  icon,
  eyebrow,
  title,
  subtitle,
  children,
  aside = false,
}: AuthShellProps) {
  const { t, messages } = useI18n();
  const card = (
    <div className="card w-full p-6 sm:p-8">
      {icon && (
        <span
          className="mb-5 grid h-11 w-11 place-items-center rounded-xl bg-sky-soft text-ink"
          aria-hidden="true"
        >
          {icon}
        </span>
      )}
      {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
      <h1 className="text-[26px] font-normal leading-tight tracking-[-0.025em] text-ink sm:text-[30px]">
        {title}
      </h1>
      {subtitle && <p className="mt-2 text-sm text-ink-2">{subtitle}</p>}
      <div className="mt-6">{children}</div>
    </div>
  );

  if (!aside) {
    return <div className="mx-auto flex w-full max-w-md flex-col py-6 sm:py-12">{card}</div>;
  }

  return (
    <div className="mx-auto grid w-full max-w-5xl items-stretch gap-4 py-2 sm:py-8 lg:grid-cols-2">
      {card}
      <aside className="gradient-panel relative hidden flex-col overflow-hidden p-8 lg:flex">
        <p className="text-xs font-medium text-ink-2">{t('landing.hero.chips.0')}</p>
        <p className="mt-3 max-w-sm text-[32px] font-light leading-[1.05] tracking-[-0.035em]">
          {t('landing.hero.title')}
        </p>
        <ul className="mt-8 space-y-2.5">
          {messages.landing.how.investorSteps.map(([step]) => (
            <li key={step} className="flex items-center gap-3 text-sm">
              <span className="grid h-6 w-6 place-items-center rounded-md bg-surface/70" aria-hidden="true">
                <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
              </span>
              {step}
            </li>
          ))}
        </ul>
        <WireframeAsset className="pointer-events-none mt-auto w-[115%] max-w-none self-end opacity-80" />
      </aside>
    </div>
  );
}
