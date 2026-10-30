import { formatAmount } from '@/core/format/number';
import type { PaymentUnit } from '../model';

/**
 * A big light numeral with its currency in small ink ("US$ 1.234" /
 * "1.234 XLM"): the unit never competes with the number.
 */
export default function MoneyFigure({
  value,
  unit,
  digits,
  className = 'text-[40px]',
}: {
  value: number;
  unit: PaymentUnit;
  digits?: number;
  className?: string;
}) {
  const n = Number(value) || 0;
  const text = formatAmount(n, digits ?? (Number.isInteger(n) ? 0 : 2));
  return (
    <span className="inline-flex items-baseline gap-1.5 text-ink">
      {unit === 'USDC' && <span className="text-sm text-ink-2">US$</span>}
      <span className={`numeral ${className}`}>{text}</span>
      {unit === 'XLM' && <span className="text-sm text-ink-2">XLM</span>}
    </span>
  );
}
