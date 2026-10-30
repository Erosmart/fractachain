import PhaseChip from '@/components/ui/PhaseChip';
import type { Position } from '@/core/api/types';
import { positionPhase } from '@/core/market/phase';

/** Offering state of a position in plain language (the shared phase chip). */
export function PositionChip({ position }: { position: Position }) {
  const phase = positionPhase(position);
  return phase ? <PhaseChip phase={phase} /> : null;
}
