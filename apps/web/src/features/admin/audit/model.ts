import type { AuditEntry } from '@/core/api/types';

/** Who did it, as shown in the table (system jobs have no actor). */
export function actorLabel(entry: AuditEntry, systemLabel: string): string {
  return entry.actorEmail || entry.actorId || systemLabel;
}

/** Local, locale-aware timestamp; the raw ISO value stays in the `title`. */
export function formatAuditTime(iso: string, locale: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(locale === 'en' ? 'en-US' : 'es-AR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

/** Pretty JSON of the free-form details, or `null` when there is nothing to show. */
export function detailsText(entry: AuditEntry): string | null {
  if (!entry.details || typeof entry.details !== 'object' || Object.keys(entry.details).length === 0)
    return null;
  try {
    return JSON.stringify(entry.details, null, 2);
  } catch {
    return null;
  }
}
