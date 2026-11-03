/** Inputs of the issuer simulator, as typed in the form. */
export interface SimulatorInput {
  quantity: string;
  unit: string;
  price: string;
  supply: string;
  softCap: string;
  hardCap: string;
  days: string;
}

export interface SimulatorResult {
  price: number;
  softCap: number;
  hardCap: number;
  /** Tokens sold if the offering fills its cap. */
  sold: number;
  /** Tokens left unsold at the cap (they stay with the issuer). */
  kept: number;
  /** Cap divided by the lot quantity, in USDC per unit. */
  perUnit: number;
  /** Close date in ms, or null without a valid duration. */
  closeAt: number | null;
  errors: { supply?: { needed: number; supply: number }; caps?: true };
}

export const DEFAULT_SIMULATION: SimulatorInput = {
  quantity: '250',
  unit: '',
  price: '1',
  supply: '250000',
  softCap: '100000',
  hardCap: '250000',
  days: '30',
};

/** Issuer contact form, prefilled with the simulated cap and a summary of the offering. */
export function issuerContactHref(summary: string, hardCap: number): string {
  const q = new URLSearchParams({ topic: 'issuer', message: summary });
  if (hardCap > 0) q.set('amount', String(Math.round(hardCap)));
  return `/contact?${q.toString()}`;
}

/** "1.500,5" or "1500.5" → 1500.5; anything not positive → 0. */
export function parsePositive(value: string): number {
  const trimmed = value.trim();
  const normalized = trimmed.includes(',') ? trimmed.replace(/\./g, '').replace(',', '.') : trimmed;
  const n = Number(normalized);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Same rules the licitación contract enforces: supply covers the cap, minimum ≤ cap. */
export function simulate(input: SimulatorInput, now: number): SimulatorResult {
  const price = parsePositive(input.price);
  const supply = Math.floor(parsePositive(input.supply));
  const soft = parsePositive(input.softCap);
  const hard = parsePositive(input.hardCap);
  const quantity = parsePositive(input.quantity);
  const days = Math.floor(parsePositive(input.days));

  const sold = price ? Math.floor(hard / price) : 0;
  const errors: SimulatorResult['errors'] = {};
  if (supply > 0 && sold > supply) errors.supply = { needed: sold, supply };
  if (hard > 0 && soft > hard) errors.caps = true;

  return {
    price,
    softCap: soft,
    hardCap: hard,
    sold,
    kept: supply >= sold ? supply - sold : 0,
    perUnit: quantity ? hard / quantity : 0,
    closeAt: days ? now + days * 86_400_000 : null,
    errors,
  };
}
