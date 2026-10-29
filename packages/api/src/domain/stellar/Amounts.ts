import { ValidationError } from '../../shared/errors';
import { STROOPS_PER_UNIT } from './StellarAddress';

/** Decimal units → stroops (7 decimals). Rejects non-positive and non-finite input. */
export function toStroops(amount: number): bigint {
  if (!Number.isFinite(amount) || amount <= 0) throw new ValidationError('Monto inválido');
  return BigInt(Math.round(amount * Number(STROOPS_PER_UNIT)));
}

export function fromStroops(stroops: bigint | number | string): number {
  const n = typeof stroops === 'bigint' ? stroops : BigInt(stroops);
  return Number(n) / Number(STROOPS_PER_UNIT);
}
