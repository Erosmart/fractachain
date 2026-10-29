export interface MervalStock {
  ticker: string;
  tokenTicker: string;
  companyName: string;
  isin: string;
  sector: string;
  priceUsdc: number;
  change24hPct: number;
  volume24hUsdc: number;
  custodiedSharesInCajaDeValores: number;
  mintedTokensInStellar: number;
  /** e.g. '1:1 (100.0%)'. */
  reserveRatio: string;
  lastAuditTimestamp: string;
  custodianCuit: string;
  /** Only active stocks show up in the public market. */
  active: boolean;
  createdAt: string;
}

export interface IStockRepository {
  list(): MervalStock[];
  findByTicker(ticker: string): MervalStock | undefined;
  insert(stock: MervalStock): void;
  save(): void;
}
