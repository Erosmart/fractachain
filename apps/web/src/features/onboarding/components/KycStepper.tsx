import { Check } from 'lucide-react';
import { useI18n } from '@/hooks/useI18n';

const STEPS = ['account', 'wallet', 'data', 'identity', 'review'] as const;

/**
 * Cuenta → Wallet → Tus datos → Validá tu identidad → Revisión.
 * `current` is the index of the step in progress (5 = everything done).
 */
export default function KycStepper({ current, className = '' }: { current: number; className?: string }) {
  const { t } = useI18n();
  const index = Math.min(current, STEPS.length - 1);
  return (
    <nav aria-label={t('onboard.steps.label')} className={className}>
      {/* Phones: one line + a slim progress track. */}
      <div className="sm:hidden">
        <p className="text-xs text-muted">
          {t('onboard.steps.progress', { n: index + 1, total: STEPS.length })}
          <span className="text-ink"> · {t(`onboard.steps.${STEPS[index]}`)}</span>
        </p>
        <div className="mt-2 grid grid-cols-5 gap-1" aria-hidden="true">
          {STEPS.map((s, i) => (
            <span
              key={s}
              className={`h-1 rounded-full ${i < current ? 'bg-navy' : i === current ? 'bg-sky-strong' : 'bg-line'}`}
            />
          ))}
        </div>
      </div>
      <ol className="hidden items-center gap-2 sm:flex">
        {STEPS.map((s, i) => {
          const done = i < current;
          const here = i === current;
          return (
            <li
              key={s}
              className="flex min-w-0 flex-1 items-center gap-2"
              aria-current={here ? 'step' : undefined}
            >
              <span
                className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-medium ${
                  done
                    ? 'bg-navy text-navy-ink'
                    : here
                      ? 'bg-surface text-ink ring-2 ring-sky-strong'
                      : 'bg-surface text-muted ring-1 ring-line'
                }`}
                aria-hidden="true"
              >
                {done ? <Check className="h-3.5 w-3.5" strokeWidth={2.5} /> : i + 1}
              </span>
              <span
                className={`truncate text-[13px] ${here ? 'font-medium text-ink' : done ? 'text-ink-2' : 'text-muted'}`}
              >
                {t(`onboard.steps.${s}`)}
                <span className="sr-only">
                  {done ? ` (${t('onboard.steps.done')})` : here ? ` (${t('onboard.steps.current')})` : ''}
                </span>
              </span>
              {i < STEPS.length - 1 && (
                <span className="hidden h-px min-w-4 flex-1 bg-line lg:block" aria-hidden="true" />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
