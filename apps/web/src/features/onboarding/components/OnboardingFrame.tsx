import type { ReactNode } from 'react';
import KycStepper from './KycStepper';

/**
 * Layout shared by the onboarding steps: stepper, title block, then the
 * step's main card with an optional side panel (stacked on phones).
 */
export default function OnboardingFrame({
  step,
  eyebrow,
  title,
  lead,
  aside,
  children,
}: {
  step: number;
  eyebrow?: ReactNode;
  title: ReactNode;
  lead?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-6xl space-y-6 sm:space-y-8">
      <KycStepper current={step} className="card px-4 py-3 sm:px-5 sm:py-4" />
      <header className="max-w-2xl">
        {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
        <h1 className="text-[28px] font-normal leading-tight tracking-[-0.025em] text-ink sm:text-[34px]">
          {title}
        </h1>
        {lead && <p className="mt-2 text-[15px] text-ink-2">{lead}</p>}
      </header>
      {aside ? (
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="min-w-0">{children}</div>
          <div className="min-w-0">{aside}</div>
        </div>
      ) : (
        children
      )}
    </div>
  );
}

/** Centered, quiet loading line for guarded screens. */
export function LoadingLine({ children }: { children: ReactNode }) {
  return (
    <p className="py-20 text-center text-sm text-muted" role="status" aria-live="polite">
      {children}
    </p>
  );
}
