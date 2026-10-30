import { formatAmount } from '../format/number';

export type PaymentUnit = 'USDC' | 'XLM';

export const unitOf = (kind?: string | null): PaymentUnit => (kind === 'XLM' ? 'XLM' : 'USDC');

/** es-AR money: "US$ 1.234,50" for USDC, "1.234,5 XLM" for lumens. Whole amounts drop the decimals. */
export function money(n: number, unit: PaymentUnit = 'USDC', digits?: number): string {
  const value = Number(n) || 0;
  const d = digits ?? (Number.isInteger(value) ? 0 : 2);
  return unit === 'XLM' ? `${formatAmount(value, d)} XLM` : `US$ ${formatAmount(value, d)}`;
}

/** Quantities of tokens: up to 4 decimals, no trailing zeros. */
export const qty = (n: number) =>
  Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 4, minimumFractionDigits: 0 });
