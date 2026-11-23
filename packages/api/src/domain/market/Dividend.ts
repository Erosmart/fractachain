export interface DividendDistribution {
  id: string;
  listingId: string;
  tokenTicker: string;
  totalUsdc: number;
  sharesOutstanding: number;
  perShare: number;
  holdersPaid: number;
  createdAt: string;
}

export interface IDividendRepository {
  list(): DividendDistribution[];
  insert(row: DividendDistribution): void;
}
