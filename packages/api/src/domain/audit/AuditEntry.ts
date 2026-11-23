import type { AuditEntry } from '@fractachain/shared';

export type { AuditEntry };

export interface IAuditRepository {
  append(entry: AuditEntry): void;
  /** Newest first. */
  list(): AuditEntry[];
}

/** Who did it, from where — taken from the HTTP request. */
export interface AuditContext {
  actorId: string | null;
  actorEmail: string | null;
  ip: string | null;
  requestId: string | null;
}
