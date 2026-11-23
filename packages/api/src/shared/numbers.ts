/** Rounds to 6 decimals — the precision the sandbox ledger keeps for USDC. */
export function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

/** Rounds a ratio to a percentage with two decimals (12.3456 → 12.35). */
export function pct(numerator: number, denominator: number): number {
  return denominator > 0 ? Math.round((numerator / denominator) * 10000) / 100 : 0;
}

/** Float tolerance used when comparing balances that went through arithmetic. */
export const EPSILON = 1e-9;

export const DAY_MS = 86_400_000;
