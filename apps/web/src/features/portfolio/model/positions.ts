/**
 * Small helpers shared by Inicio and Portfolio. Holdings themselves come
 * from the chain (see ./chain.ts).
 */

/** Unit an offering is subscribed in. */
export const unitOf = (kind?: string | null) => (kind === 'XLM' ? 'XLM' : 'USDC');

/**
 * Elapsed day of an open offering ("día 12 de 30"), from when it was listed
 * and its length in days. `null` when it can't be told.
 */
export function offeringDay(
  listedAt: string | undefined,
  offeringDays: number | undefined,
  now: Date = new Date(),
): { day: number; total: number } | null {
  const start = listedAt ? Date.parse(listedAt) : NaN;
  const total = Math.round(Number(offeringDays));
  if (!Number.isFinite(start) || !(total > 0)) return null;
  const elapsed = Math.floor((now.getTime() - start) / 86_400_000) + 1;
  if (elapsed < 1) return null;
  return { day: Math.min(total, elapsed), total };
}
