import type { DividendDistribution, IDividendRepository } from '../../../domain/market/Dividend';
import type { IDocumentStore } from '../DocumentStore';

export const DIVIDENDS_KEY = 'dividends.json';

export class JsonDividendRepository implements IDividendRepository {
  private readonly rows: DividendDistribution[];

  constructor(private readonly store: IDocumentStore) {
    this.rows = store.read<DividendDistribution[]>(DIVIDENDS_KEY, []);
  }

  list(): DividendDistribution[] {
    return [...this.rows];
  }

  insert(row: DividendDistribution): void {
    this.rows.push(row);
    this.store.write(DIVIDENDS_KEY, this.rows);
  }
}
