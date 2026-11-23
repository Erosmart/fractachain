import type { ISandboxBookRepository, SandboxBookState } from '../../../domain/market/SandboxBook';
import type { IDocumentStore } from '../DocumentStore';

export const ORDERBOOK_KEY = 'orderbook.json';

export class JsonSandboxBookRepository implements ISandboxBookRepository {
  private readonly state: SandboxBookState;

  constructor(private readonly store: IDocumentStore) {
    const raw = store.read<Partial<SandboxBookState>>(ORDERBOOK_KEY, {});
    this.state = { orders: raw.orders || [], trades: raw.trades || [] };
  }

  load(): SandboxBookState {
    return this.state;
  }

  save(state: SandboxBookState): void {
    this.store.write(ORDERBOOK_KEY, state);
  }
}
