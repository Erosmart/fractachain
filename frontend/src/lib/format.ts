/** Pin thousands separators so SSR (Node locale) and the browser don't disagree. */
export function formatAmount(n: number, digits = 0) {
  return Number(n).toLocaleString('es-AR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function formatInt(n: number) {
  return formatAmount(n, 0);
}

export const format = formatAmount;
