import type { TxAction, TxStatus } from '@fractachain/shared';
import type { IDocumentStore } from '../../infrastructure/persistence/DocumentStore';

export const TX_BUILDS_KEY = 'tx-builds.json';

/** A transaction the API built for an investor's wallet to sign. */
export interface TxBuildRecord {
  id: string;
  accountId: string;
  /** The investor's G… address: source and only signer. */
  wallet: string;
  action: TxAction;
  listingId?: string;
  contractId?: string;
  function?: string;
  /** Hash of the built transaction (what the wallet signs). */
  hash: string;
  createdAt: string;
  expiresAt: string;
  /** Set once, when a submission is accepted for relay: builds are single-use. */
  consumedAt?: string;
  status?: TxStatus;
  ledger?: number;
}

const KEEP_MS = 7 * 86_400_000;
const MAX_RECORDS = 5_000;

/**
 * Persisted builds (survive restarts and replicas through the document store's
 * Postgres mirror): single use, expiry, and the set of hashes already relayed.
 */
export class TxBuildStore {
  private rows: TxBuildRecord[];

  constructor(
    private readonly store: IDocumentStore,
    private readonly now: () => number,
  ) {
    this.rows = store.read<TxBuildRecord[]>(TX_BUILDS_KEY, []);
  }

  find(id: string): TxBuildRecord | undefined {
    return this.rows.find((r) => r.id === id);
  }

  /** A relayed transaction with this hash exists (any build). */
  wasSubmitted(hash: string): boolean {
    return this.rows.some((r) => r.hash === hash && Boolean(r.consumedAt));
  }

  insert(record: TxBuildRecord): void {
    const cutoff = this.now() - KEEP_MS;
    this.rows = [...this.rows.filter((r) => Date.parse(r.createdAt) >= cutoff), record].slice(-MAX_RECORDS);
    this.persist();
  }

  update(record: TxBuildRecord): void {
    const idx = this.rows.findIndex((r) => r.id === record.id);
    if (idx >= 0) this.rows[idx] = record;
    this.persist();
  }

  private persist(): void {
    this.store.write(TX_BUILDS_KEY, this.rows);
  }
}
