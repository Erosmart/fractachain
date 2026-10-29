import { Pool } from 'pg';
import type { ILogger } from '../../shared/logger';
import type { IDocumentStore, IFlushable } from './DocumentStore';
import type { JsonFileDocumentStore } from './JsonFileDocumentStore';

/**
 * Decorator that mirrors every write of a local store into Postgres.
 *
 * Postgres is the source of truth across deploys (container disks are wiped
 * on redeploy); the JSON files are the hot cache. `restore()` must run before
 * any repository is constructed so they load the persisted state — v1 did the
 * same thing in a separate `scripts/pg_restore.js` before `node server.js`.
 *
 * Writes are queued and serialized: saves are infrequent and ordering matters
 * more than throughput (two quick saves of the same key must land in order).
 */
export class PostgresMirroredStore implements IDocumentStore, IFlushable {
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly local: JsonFileDocumentStore,
    private readonly pool: Pool,
    private readonly allowedKeys: ReadonlySet<string>,
    private readonly logger: ILogger,
  ) {}

  static connect(
    local: JsonFileDocumentStore,
    databaseUrl: string,
    allowedKeys: ReadonlySet<string>,
    logger: ILogger,
  ): PostgresMirroredStore {
    return new PostgresMirroredStore(local, new Pool({ connectionString: databaseUrl, max: 4 }), allowedKeys, logger);
  }

  /** Pulls every known document from Postgres into the local cache. Never throws. */
  async restore(): Promise<number> {
    try {
      await this.pool.query(
        'CREATE TABLE IF NOT EXISTS kv_store (key TEXT PRIMARY KEY, data JSONB NOT NULL, updated_at TIMESTAMPTZ DEFAULT now())',
      );
      const res = await this.pool.query<{ key: string; data: unknown }>('SELECT key, data FROM kv_store');
      let restored = 0;
      for (const row of res.rows) {
        if (!this.allowedKeys.has(row.key)) continue;
        this.local.replaceRaw(row.key, row.data);
        restored++;
      }
      this.logger.info('documentos restaurados desde Postgres', { restored });
      return restored;
    } catch (err) {
      this.logger.error('restore desde Postgres falló; se arranca con archivos locales', { err: String(err) });
      return 0;
    }
  }

  read<T>(key: string, fallback: T): T {
    return this.local.read(key, fallback);
  }

  write(key: string, data: unknown): void {
    this.local.write(key, data);
    if (!this.allowedKeys.has(key)) return;
    const payload = JSON.stringify(data);
    this.queue = this.queue
      .then(() =>
        this.pool.query(
          'INSERT INTO kv_store (key, data, updated_at) VALUES ($1, $2, now()) ' +
            'ON CONFLICT (key) DO UPDATE SET data = $2, updated_at = now()',
          [key, payload],
        ),
      )
      .catch((err) => this.logger.error('persistencia en Postgres falló', { key, err: String(err) }));
  }

  async flush(): Promise<void> {
    await this.queue.catch(() => undefined);
  }

  async close(): Promise<void> {
    await this.flush();
    await this.pool.end().catch(() => undefined);
  }
}
