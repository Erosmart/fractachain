import { StatusChip, type Tone } from '@/components/ui/kit';
import type { OfferingPhase } from '@/core/market/phase';
import { useI18n } from '@/hooks/useI18n';

const PHASE_TONE: Record<OfferingPhase, Tone> = {
  upcoming: 'neutral',
  open: 'sky',
  closingSoon: 'warn',
  minReached: 'good',
  capFilled: 'good',
  closed: 'neutral',
  failed: 'bad',
  refundAvailable: 'peach',
  payingIncome: 'good',
  expired: 'warn',
  refunded: 'neutral',
};

/**
 * The offering state as icon + label (never the raw contract state). Every
 * screen — landing, Inicio, Portfolio, Licitaciones — uses this chip, so an
 * offering reads the same everywhere.
 */
export default function PhaseChip({ phase, className }: { phase: OfferingPhase; className?: string }) {
  const { t } = useI18n();
  return (
    <StatusChip tone={PHASE_TONE[phase]} className={className}>
      {t(`offerings.phase.${phase}`)}
    </StatusChip>
  );
}
