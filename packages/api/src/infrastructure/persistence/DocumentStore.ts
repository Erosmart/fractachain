/**
 * Persistence port for whole-document storage.
 *
 * The platform keeps each aggregate collection (users, listings, orderbook…)
 * as one JSON document. That is what v1 did with loose `fs.writeFileSync`
 * calls; here it sits behind an interface so repositories never know whether
 * the bytes land on disk, in Postgres, or in memory during tests.
 */
export interface IDocumentStore {
  /** Returns the stored document, or `fallback` when it does not exist or is unreadable. */
  read<T>(key: string, fallback: T): T;
  write(key: string, data: unknown): void;
}

/** Hook a store can expose so the composition root can wait for pending writes on shutdown. */
export interface IFlushable {
  flush(): Promise<void>;
}

/** Volatile store for tests. */
export class InMemoryDocumentStore implements IDocumentStore {
  private readonly docs = new Map<string, string>();

  read<T>(key: string, fallback: T): T {
    const raw = this.docs.get(key);
    return raw === undefined ? fallback : (JSON.parse(raw) as T);
  }

  write(key: string, data: unknown): void {
    this.docs.set(key, JSON.stringify(data));
  }
}
