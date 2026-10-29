import type { IStockRepository, MervalStock } from '../../../domain/stock/MervalStock';
import type { IDocumentStore } from '../DocumentStore';

export const STOCKS_KEY = 'stocks.json';

type StockSeed = Omit<MervalStock, 'active' | 'createdAt' | 'lastAuditTimestamp'>;

const CUSTODIAN = '30-71829304-8';
const seed = (
  ticker: string,
  companyName: string,
  isin: string,
  sector: string,
  priceUsdc: number,
  change24hPct: number,
  volume24hUsdc: number,
  shares: number,
): StockSeed => ({
  ticker,
  tokenTicker: `t${ticker === 'YPFD' ? 'YPF' : ticker}`,
  companyName,
  isin,
  sector,
  priceUsdc,
  change24hPct,
  volume24hUsdc,
  custodiedSharesInCajaDeValores: shares,
  mintedTokensInStellar: shares,
  reserveRatio: '1:1 (100.0%)',
  custodianCuit: CUSTODIAN,
});

/** Catalog used the first time the store boots without `stocks.json`. */
const SEED: StockSeed[] = [
  seed('YPFD', 'YPF Sociedad Anónima (Clase D)', 'ARP9897X1319', 'Energía y Petróleo', 24.5, 3.42, 482900, 50000),
  seed('GGAL', 'Grupo Financiero Galicia S.A.', 'ARP432631215', 'Banca y Finanzas', 38.2, -0.85, 615000, 80000),
  seed('PAMP', 'Pampa Energía S.A.', 'ARP7346A1033', 'Generación Eléctrica y Gas', 52.1, 1.75, 230400, 25000),
  seed('ALUA', 'Aluar Aluminio Argentino S.A.', 'ARP017251016', 'Materiales e Industria', 0.95, 0.2, 98000, 200000),
  seed('BMA', 'Banco Macro S.A. (Clase B)', 'ARP125991090', 'Banca y Finanzas', 64.8, -1.2, 175000, 15000),
  seed('CRES', 'Cresud S.A.C.I.F. y A.', 'ARP315071179', 'Agro e Inmuebles', 9.4, 2.1, 142000, 40000),
];

export class JsonStockRepository implements IStockRepository {
  private readonly stocks: MervalStock[];

  constructor(private readonly store: IDocumentStore) {
    const raw = store.read<MervalStock[] | null>(STOCKS_KEY, null);
    if (Array.isArray(raw)) {
      this.stocks = raw.map((s) => ({ ...s, active: s.active !== false }));
    } else {
      const now = new Date().toISOString();
      this.stocks = SEED.map((s) => ({ ...s, lastAuditTimestamp: now, active: true, createdAt: now }));
      this.save();
    }
  }

  list(): MervalStock[] {
    return [...this.stocks];
  }

  findByTicker(ticker: string): MervalStock | undefined {
    const t = String(ticker || '').trim().toUpperCase();
    return this.stocks.find((s) => s.ticker === t || s.tokenTicker.toUpperCase() === t);
  }

  insert(stock: MervalStock): void {
    this.stocks.push(stock);
    this.save();
  }

  save(): void {
    this.store.write(STOCKS_KEY, this.stocks);
  }
}
