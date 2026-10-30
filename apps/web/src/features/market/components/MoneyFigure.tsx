import { formatAmount } from '@/core/format/number';

/**
 * A big light numeral with its asset code in small ink ("1.234 USDC",
 * "15 XLM"): the code is always the real payment asset, never a currency
 * symbol assumed by the screen.
 */
export default function MoneyFigure({
  value,
  code,
  digits,
  className = 'text-[40px]',
}: {
  value: number | null;
  code: string;
  digits?: number;
  className?: string;
}) {
  if (value === null || !Number.isFinite(value)) {
    return <span className={`numeral text-ink ${className}`}>—</span>;
  }
  const n = Number(value) || 0;
  const text = formatAmount(n, digits ?? (Number.isInteger(n) ? 0 : 2));
  return (
    <span className="inline-flex items-baseline gap-1.5 text-ink">
      <span className={`numeral ${className}`}>{text}</span>
      {code && <span className="text-sm text-ink-2">{code}</span>}
    </span>
  );
}
