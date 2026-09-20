/** Locale-stable grouping so SSR and the browser never disagree. */
export function formatAmount(value: number, maxFractionDigits = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '0';
  const factor = 10 ** Math.max(0, maxFractionDigits);
  const rounded = maxFractionDigits > 0 ? Math.round(n * factor) / factor : Math.round(n);
  const [intPart, frac] = String(Math.abs(rounded)).split('.');
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const signed = rounded < 0 ? `-${grouped}` : grouped;
  return frac ? `${signed},${frac}` : signed;
}
