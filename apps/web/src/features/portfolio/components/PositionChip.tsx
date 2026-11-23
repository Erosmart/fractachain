import PhaseChip from '@/components/ui/PhaseChip';
import { holdingPhase, type ChainHolding } from '../model/chain';

/** State of the tender behind a holding, read from the contract (the shared phase chip). */
export function PositionChip({ holding }: { holding: Pick<ChainHolding, 'stateName' | 'units'> }) {
  return <PhaseChip phase={holdingPhase(holding)} />;
}
