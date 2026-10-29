/** A tokenized Merval stock as the stocks screen renders it. */
export interface StockCustody {
  symbol: string;
  companyName: string;
  tickerMerval: string;
  cajaDeValoresSubaccount: string;
  isin: string;
  totalSharesInCustody: number;
  tokensCirculating: number;
  backingRatio: number;
  lastAuditTimestamp: string;
  auditor: string;
  priceUsd: number;
  change24h: number;
}

/** Offline catalog shown when the custody API cannot be reached. */
export const DEFAULT_STOCKS: StockCustody[] = [
  {
    symbol: 'tYPF',
    companyName: 'YPF S.A. (Clase D)',
    tickerMerval: 'YPFD',
    cajaDeValoresSubaccount: '84920-CV',
    isin: 'ARP700011037',
    totalSharesInCustody: 150000,
    tokensCirculating: 150000,
    backingRatio: 1.0,
    lastAuditTimestamp: '2026-09-20 10:00 UTC',
    auditor: 'PricewaterhouseCoopers (PwC) / CNV',
    priceUsd: 28.5,
    change24h: 3.2,
  },
  {
    symbol: 'tGGAL',
    companyName: 'Grupo Financiero Galicia S.A.',
    tickerMerval: 'GGAL',
    cajaDeValoresSubaccount: '84920-CV',
    isin: 'ARP432631215',
    totalSharesInCustody: 220000,
    tokensCirculating: 220000,
    backingRatio: 1.0,
    lastAuditTimestamp: '2026-09-20 10:00 UTC',
    auditor: 'PricewaterhouseCoopers (PwC) / CNV',
    priceUsd: 41.2,
    change24h: -1.1,
  },
  {
    symbol: 'tPAMP',
    companyName: 'Pampa Energía S.A.',
    tickerMerval: 'PAMP',
    cajaDeValoresSubaccount: '84920-CV',
    isin: 'ARP733691060',
    totalSharesInCustody: 85000,
    tokensCirculating: 85000,
    backingRatio: 1.0,
    lastAuditTimestamp: '2026-09-20 10:00 UTC',
    auditor: 'PricewaterhouseCoopers (PwC) / CNV',
    priceUsd: 54.8,
    change24h: 1.8,
  },
];

const str = (v: unknown, fallback = ''): string => (typeof v === 'string' && v ? v : fallback);
const num = (...values: unknown[]): number => {
  for (const v of values) {
    const n = Number(v);
    if (v !== undefined && v !== null && Number.isFinite(n)) return n;
  }
  return 0;
};

/** Accepts both the legacy custody shape and the current `MervalStock` rows. */
export function normalizeStock(input: unknown): StockCustody | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;
  const symbol = str(raw.symbol) || str(raw.tokenTicker);
  if (!symbol.trim()) return null;
  return {
    symbol: symbol.trim(),
    companyName: str(raw.companyName),
    tickerMerval: str(raw.tickerMerval) || str(raw.ticker),
    cajaDeValoresSubaccount: str(raw.cajaDeValoresSubaccount, '84920-CV'),
    isin: str(raw.isin),
    totalSharesInCustody: num(raw.totalSharesInCustody, raw.custodiedSharesInCajaDeValores),
    tokensCirculating: num(raw.tokensCirculating, raw.mintedTokensInStellar),
    backingRatio: raw.backingRatio === undefined ? 1 : num(raw.backingRatio),
    lastAuditTimestamp: str(raw.lastAuditTimestamp),
    auditor: str(raw.auditor, 'PwC / CNV'),
    priceUsd: num(raw.priceUsd, raw.priceUsdc),
    change24h: num(raw.change24h, raw.change24hPct),
  };
}
