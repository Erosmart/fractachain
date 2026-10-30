import { StatusChip } from '@/components/ui/kit';
import type { Position } from '@/core/api/types';
import { useI18n } from '@/hooks/useI18n';
import { positionChip } from '../model/positions';

/** Offering state of a position in plain language (icon + label). */
export function PositionChip({ position }: { position: Position }) {
  const { t } = useI18n();
  const chip = positionChip(position);
  if (!chip) return null;
  return <StatusChip tone={chip.tone}>{t(`dashboard.chip.${chip.key}`)}</StatusChip>;
}
