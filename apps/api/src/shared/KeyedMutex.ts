/**
 * In-process mutual exclusion per key.
 *
 * Some flows read the platform ledger, await a network call, then write the
 * ledger back (e.g. "pay the tokens not yet on-chain, then record them").
 * Two concurrent requests would both see the same pending amount and pay it
 * twice. Serializing them per key (account + listing) closes that window.
 * One API process owns the JSON store, so an in-process lock is sufficient;
 * a multi-replica deployment would need a distributed lock (or Postgres row
 * locks) instead.
 */
export class KeyedMutex {
  private readonly tails = new Map<string, Promise<unknown>>();

  async run<T>(key: string, task: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(key) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = previous.then(() => current);
    this.tails.set(key, tail);
    try {
      await previous.catch(() => undefined);
      return await task();
    } finally {
      release();
      if (this.tails.get(key) === tail) this.tails.delete(key);
    }
  }
}
