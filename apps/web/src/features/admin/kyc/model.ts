import type { Tone } from '@/components/ui/kit';
import type { KycQueueRow, KycReviewStatus, ProviderSessionStatus } from '@/core/api/AdminApi';

export type KycFilter = KycReviewStatus | 'ALL';
export const KYC_FILTERS: readonly KycFilter[] = ['PENDING', 'APPROVED', 'REJECTED', 'REVOKED', 'ALL'];

/** Review target: a request older than this is out of SLA. */
export const SLA_HOURS = 72;

export function countByStatus(rows: readonly KycQueueRow[]): Record<KycFilter, number> {
  const counts: Record<KycFilter, number> = {
    PENDING: 0,
    APPROVED: 0,
    REJECTED: 0,
    REVOKED: 0,
    ALL: rows.length,
  };
  for (const r of rows) counts[r.status] += 1;
  return counts;
}

export function matchesSearch(row: KycQueueRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [row.fullName, row.docNumber, row.walletAddress, row.email, row.verification?.identity?.fullName]
    .filter(Boolean)
    .some((field) => String(field).toLowerCase().includes(q));
}

export function filterRows(rows: readonly KycQueueRow[], filter: KycFilter, query: string): KycQueueRow[] {
  return rows.filter((r) => (filter === 'ALL' || r.status === filter) && matchesSearch(r, query));
}

/** Oldest pending request first: the queue is worked in arrival order. */
export function sortForReview(rows: readonly KycQueueRow[]): KycQueueRow[] {
  return [...rows].sort((a, b) => {
    if (a.status === 'PENDING' && b.status === 'PENDING') return a.createdAt.localeCompare(b.createdAt);
    if (a.status === 'PENDING') return -1;
    if (b.status === 'PENDING') return 1;
    return b.createdAt.localeCompare(a.createdAt);
  });
}

export const STATUS_TONE: Record<KycReviewStatus, Tone> = {
  PENDING: 'sky',
  APPROVED: 'good',
  REJECTED: 'bad',
  REVOKED: 'warn',
};

/** Only pending requests age against the SLA: ≥ 2/3 of it warns, past it is late. */
export function slaTone(status: KycReviewStatus, hours: number): Tone {
  if (status !== 'PENDING') return 'neutral';
  if (hours >= SLA_HOURS) return 'bad';
  if (hours >= (SLA_HOURS * 2) / 3) return 'warn';
  return 'neutral';
}

export function providerTone(status: ProviderSessionStatus): Tone {
  switch (status) {
    case 'Approved':
      return 'good';
    case 'Declined':
      return 'bad';
    case 'In Review':
    case 'Resubmitted':
      return 'warn';
    case 'Kyc Expired':
    case 'Expired':
    case 'Abandoned':
      return 'peach';
    default:
      return 'sky';
  }
}

/** Didit check statuses are free-form ("Approved", "Declined", "In Review", "Not Finished"…). */
export function checkTone(value: string | undefined): Tone {
  const v = String(value || '').toLowerCase();
  if (!v) return 'neutral';
  if (v === 'approved' || v === 'passed' || v === 'clear') return 'good';
  if (v === 'declined' || v === 'failed' || v === 'rejected') return 'bad';
  if (v.includes('review') || v.includes('warn') || v.includes('match')) return 'warn';
  return 'neutral';
}

/** Statuses Didit reports for each check; anything else is shown verbatim. */
export const KNOWN_CHECK_STATUSES = ['Approved', 'Declined', 'In Review', 'Not Finished', 'Expired'] as const;

export function isKnownCheckStatus(
  value: string | undefined,
): value is (typeof KNOWN_CHECK_STATUSES)[number] {
  return KNOWN_CHECK_STATUSES.includes(value as (typeof KNOWN_CHECK_STATUSES)[number]);
}

const normalizeName = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1);

/**
 * Loose name comparison (accents, case, order and extra middle names
 * ignored): every word of the shorter name must appear in the longer one.
 */
export function namesMatch(declared: string | undefined, onDocument: string | undefined): boolean {
  if (!declared || !onDocument) return true;
  const a = normalizeName(declared);
  const b = normalizeName(onDocument);
  if (!a.length || !b.length) return true;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short.every((w) => long.includes(w));
}

/**
 * Reason sent to the API: the predefined label, plus the free text when given.
 * The last option ("Otro motivo") needs the free text. `null` = incomplete.
 */
export function composeReason(options: readonly string[], choice: number, detail: string): string | null {
  const label = options[choice];
  if (!label) return null;
  const text = detail.trim();
  const isOther = choice === options.length - 1;
  if (isOther) return text ? text.slice(0, 480) : null;
  return (text ? `${label}: ${text}` : label).slice(0, 480);
}
