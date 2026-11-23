import { ValidationError } from '../../shared/errors';

/** Every Stellar Asset Contract (XLM, Circle's USDC, team test assets) uses 7 decimals. */
export const SAC_DECIMALS = 7;

function scale(decimals: number): number {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18) {
    throw new ValidationError(`Decimales de token inválidos: ${decimals}`);
  }
  return 10 ** decimals;
}

/**
 * Decimal amount → token base units with the token's own `decimals()`.
 * Rejects non-positive and non-finite input, and amounts finer than the token allows.
 */
export function toUnits(amount: number, decimals: number): bigint {
  if (!Number.isFinite(amount) || amount <= 0) throw new ValidationError('Monto inválido');
  const raw = amount * scale(decimals);
  const rounded = Math.round(raw);
  // Float noise on representable amounts is far below 1e-4 base units; more is a real extra decimal.
  if (Math.abs(raw - rounded) > 1e-4) {
    throw new ValidationError(`El monto tiene más de ${decimals} decimales`);
  }
  return BigInt(rounded);
}

/** Token base units → decimal amount. */
export function fromUnits(raw: bigint | number | string, decimals: number): number {
  const n = typeof raw === 'bigint' ? raw : BigInt(raw);
  const s = BigInt(scale(decimals));
  // Split so large balances keep their precision before the final division.
  return Number(n / s) + Number(n % s) / Number(s);
}

/** Decimal units → stroops (7 decimals). Rejects non-positive and non-finite input. */
export function toStroops(amount: number): bigint {
  return toUnits(amount, SAC_DECIMALS);
}

export function fromStroops(stroops: bigint | number | string): number {
  return fromUnits(stroops, SAC_DECIMALS);
}
