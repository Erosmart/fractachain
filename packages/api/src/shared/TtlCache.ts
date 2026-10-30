/**
 * Short-lived cache of async reads, keyed by string. Concurrent callers of a
 * missing key share one in-flight load; failed loads are not kept.
 */
export class TtlCache<V> {
  private readonly entries = new Map<string, { at: number; value: Promise<V> }>();

  constructor(
    private readonly ttlMs: number,
    private readonly now: () => number = Date.now,
    private readonly maxEntries = 500,
  ) {}

  get(key: string, load: () => Promise<V>): Promise<V> {
    const hit = this.entries.get(key);
    if (hit && this.now() - hit.at < this.ttlMs) return hit.value;
    const value = load();
    this.entries.set(key, { at: this.now(), value });
    value.catch(() => {
      if (this.entries.get(key)?.value === value) this.entries.delete(key);
    });
    if (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
    return value;
  }

  /** Drops `scope` and every `scope|…` key. */
  forget(scope: string): void {
    for (const key of [...this.entries.keys()]) {
      if (key === scope || key.startsWith(`${scope}|`)) this.entries.delete(key);
    }
  }
}
