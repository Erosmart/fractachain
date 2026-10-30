import { formatAmount } from '@/core/format/number';

/** USDC-style amount: 2 decimals (es-AR separators). */
export const money = (n: number, digits = 2) => formatAmount(Number.isFinite(n) ? n : 0, digits);

/** Signed amount ("+12,50", "−3,00"); zero has no sign. */
export function signed(n: number, digits = 2): string {
  if (!Number.isFinite(n) || n === 0) return money(0, digits);
  return `${n > 0 ? '+' : '−'}${money(Math.abs(n), digits)}`;
}

/** Signed percentage ("+4,2 %"). */
export function signedPct(n: number, digits = 1): string {
  return `${signed(n, digits)} %`;
}

/** Plain percentage of a ratio in [0, 1] ("7 %"). */
export function pct(ratio: number): string {
  if (!Number.isFinite(ratio)) return '—';
  const v = ratio * 100;
  return `${formatAmount(v, v > 0 && v < 1 ? 1 : 0)} %`;
}

/** Token / raw ledger amount: integers without decimals, small values with 4. */
export function amount(raw: string | number): string {
  const n = Number(raw);
  if (!Number.isFinite(n)) return String(raw);
  if (Number.isInteger(n)) return formatAmount(n, 0);
  return formatAmount(n, Math.abs(n) < 1 ? 4 : 2);
}

/** "07:32" in the visitor's clock. */
export function clock(date: Date, locale: string): string {
  return date.toLocaleTimeString(locale === 'en' ? 'en-US' : 'es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
}

/** "29 oct" / "Oct 29". */
export function shortDate(date: Date, locale: string): string {
  return date
    .toLocaleDateString(locale === 'en' ? 'en-US' : 'es-AR', { day: 'numeric', month: 'short' })
    .replace('.', '');
}

/** "29 oct 2026, 23:22". */
export function dateTime(date: Date, locale: string): string {
  return date.toLocaleString(locale === 'en' ? 'en-US' : 'es-AR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
}
