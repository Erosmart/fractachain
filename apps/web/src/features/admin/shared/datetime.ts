import type { Translate } from '@/core/i18n/translate';

/** ISO timestamp → value for `<input type="datetime-local">` in the browser's timezone. */
export function toDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const HOUR = 3_600_000;

/** Whole hours between `iso` and `now` (0 for unparseable or future dates). */
export function hoursSince(iso: string | undefined, now: number): number {
  const t = iso ? Date.parse(iso) : Number.NaN;
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((now - t) / HOUR));
}

/** "hace 3 h", "hace 2 d" — compact relative age for queues and logs. */
export function relativeAge(iso: string | undefined, now: number, t: Translate): string {
  const t0 = iso ? Date.parse(iso) : Number.NaN;
  if (Number.isNaN(t0)) return '—';
  const minutes = Math.max(0, Math.floor((now - t0) / 60_000));
  if (minutes < 1) return t('admin.common.ago.now');
  if (minutes < 60) return t('admin.common.ago.minutes', { n: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return t('admin.common.ago.hours', { n: hours });
  return t('admin.common.ago.days', { n: Math.floor(hours / 24) });
}

/** "en 5 h", "en 3 días", "vencida" — time left until a deadline. */
export function relativeUntil(at: Date, now: number, t: Translate): string {
  const ms = at.getTime() - now;
  if (ms <= 0) return t('admin.common.in.overdue');
  const hours = Math.ceil(ms / HOUR);
  if (hours < 48) return t('admin.common.in.hours', { n: hours });
  return t('admin.common.in.days', { n: Math.ceil(hours / 24) });
}

/** Locale-aware short date + time. */
export function formatDateTime(iso: string | undefined, locale: string): string {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(locale === 'en' ? 'en-US' : 'es-AR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}
