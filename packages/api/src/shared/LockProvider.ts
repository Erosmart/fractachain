import type { Pool } from 'pg';
import { KeyedMutex } from './KeyedMutex';

/**
 * Lock keys, namespaced per flow. Locks are not reentrant: a flow that holds
 * one key and calls into another locked flow (a contribution that reaches
 * the hard cap triggers settlement, which pays the holder) must use a
 * *different* key, or it waits for itself forever.
 */
export const LockKeys = {
  /** Investor action on an offering (contribute, refund). */
  offering: (accountId: string, listingId: string) => `offering:${accountId}:${listingId}`,
  /** On-ledger payout of claimed tokens. */
  payout: (accountId: string, listingId: string) => `payout:${accountId}:${listingId}`,
} as const;

/**
 * Mutual exclusion around "read ledger → await network → write ledger"
 * flows, so a retry or a concurrent request can never pay twice.
 */
export interface ILockProvider {
  run<T>(key: string, task: () => Promise<T>): Promise<T>;
}

/** Single process: an in-memory keyed mutex. */
export class InProcessLockProvider implements ILockProvider {
  private readonly mutex = new KeyedMutex();

  run<T>(key: string, task: () => Promise<T>): Promise<T> {
    return this.mutex.run(key, task);
  }
}

/**
 * Several replicas sharing Postgres: a session-level advisory lock per key
 * (`pg_advisory_lock(hashtextextended(key))`) held on a dedicated connection
 * for the duration of the task. The in-process mutex in front keeps one
 * replica from parking many connections on the same key.
 */
export class PostgresAdvisoryLockProvider implements ILockProvider {
  private readonly local = new KeyedMutex();

  constructor(
    private readonly pool: Pick<Pool, 'connect'>,
    private readonly namespace = 'fractachain',
  ) {}

  run<T>(key: string, task: () => Promise<T>): Promise<T> {
    return this.local.run(key, async () => {
      const client = await this.pool.connect();
      const lockKey = `${this.namespace}:${key}`;
      try {
        await client.query('SELECT pg_advisory_lock(hashtextextended($1, 0))', [lockKey]);
        try {
          return await task();
        } finally {
          await client.query('SELECT pg_advisory_unlock(hashtextextended($1, 0))', [lockKey]);
        }
      } finally {
        client.release();
      }
    });
  }
}
