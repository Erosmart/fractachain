import type { SupportMessage } from '@fractachain/shared';

export type SupportFilter = 'open' | 'closed' | 'all';

/** Newest first; ties by id so the order is stable across refreshes. */
export function sortInbox(rows: SupportMessage[]): SupportMessage[] {
  return [...rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
}

export function countOpen(rows: SupportMessage[]): number {
  return rows.filter((r) => r.status === 'open').length;
}

/** mailto: with the reference in the subject; the address is the one the person gave. */
export function replyHref(m: Pick<SupportMessage, 'email' | 'id' | 'topic'>, subject: string): string {
  return `mailto:${encodeURIComponent(m.email)}?subject=${encodeURIComponent(`${subject} · ${m.id}`)}`;
}
