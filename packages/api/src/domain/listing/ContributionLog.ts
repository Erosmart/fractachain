/**
 * When money came into an offering — no identities, just time and amount.
 * Feeds the subscription curve of the offering page.
 */
export interface ContributionEvent {
  listingId: string;
  at: string;
  usdc: number;
}

export interface IContributionLog {
  append(event: ContributionEvent): void;
  forListing(listingId: string): ContributionEvent[];
}

export interface OfferingActivity {
  /** Distinct accounts holding a non-refunded contribution. */
  investors: number;
  /** Contributions per calendar day (UTC), oldest first. */
  daily: { date: string; usdc: number }[];
  /** Raised before the log existed (no dates). */
  undatedUsdc: number;
}

/** Groups contributions by UTC day. */
export function dailyTotals(events: ContributionEvent[]): { date: string; usdc: number }[] {
  const byDay = new Map<string, number>();
  for (const e of events) {
    const day = e.at.slice(0, 10);
    byDay.set(day, (byDay.get(day) ?? 0) + e.usdc);
  }
  return [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, usdc]) => ({ date, usdc }));
}
