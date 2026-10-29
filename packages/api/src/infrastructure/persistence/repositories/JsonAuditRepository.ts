import type { AuditEntry, IAuditRepository } from '../../../domain/audit/AuditEntry';
import type { IDocumentStore } from '../DocumentStore';

export const AUDIT_KEY = 'audit.json';

/**
 * Append-only audit trail, capped to the most recent `capacity` entries (the
 * Postgres mirror keeps the same document). Entries are never edited.
 */
export class JsonAuditRepository implements IAuditRepository {
  private readonly entries: AuditEntry[];

  constructor(
    private readonly store: IDocumentStore,
    private readonly capacity = 5_000,
  ) {
    this.entries = store.read<AuditEntry[]>(AUDIT_KEY, []);
  }

  append(entry: AuditEntry): void {
    this.entries.unshift(Object.freeze({ ...entry }));
    if (this.entries.length > this.capacity) this.entries.length = this.capacity;
    this.store.write(AUDIT_KEY, this.entries);
  }

  list(): AuditEntry[] {
    return [...this.entries];
  }
}
