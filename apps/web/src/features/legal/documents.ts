import type { Locale } from '@/core/i18n/translate';

/**
 * The legal documents and their current versions. Bump `version` and
 * `effective` when a document changes materially; the account flow asks
 * users to accept new versions of the terms and the privacy policy.
 */
export type LegalDocId = 'terms' | 'privacy' | 'cookies' | 'risks';

export interface LegalDoc {
  id: LegalDocId;
  path: string;
  version: string;
  /** ISO date (YYYY-MM-DD) the version is effective from. */
  effective: string;
}

export const LEGAL_DOCS: readonly LegalDoc[] = [
  { id: 'terms', path: '/legal/terms', version: '1.0', effective: '2026-10-30' },
  { id: 'privacy', path: '/legal/privacy', version: '1.0', effective: '2026-10-30' },
  { id: 'cookies', path: '/legal/cookies', version: '1.0', effective: '2026-10-30' },
  { id: 'risks', path: '/legal/risks', version: '1.0', effective: '2026-10-30' },
];

export function legalDoc(id: LegalDocId): LegalDoc {
  const doc = LEGAL_DOCS.find((d) => d.id === id);
  if (!doc) throw new Error(`Unknown legal document: ${id}`);
  return doc;
}

/** "30 de octubre de 2026" / "October 30, 2026" — fixed to UTC so SSR and the browser agree. */
export function formatLegalDate(iso: string, locale: Locale): string {
  const date = new Date(`${iso}T12:00:00Z`);
  return new Intl.DateTimeFormat(locale === 'es' ? 'es-AR' : 'en-US', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

/** Public, indexable pages (sitemap). Dynamic offering pages are discovered through /market. */
export const PUBLIC_PATHS: readonly string[] = [
  '/',
  '/market',
  '/issuers',
  '/stocks',
  '/forwards',
  '/warrants',
  '/login',
  '/register',
  '/forgot-password',
  '/contact',
  '/help',
  '/transparency',
  '/legal',
  ...LEGAL_DOCS.map((d) => d.path),
];

/** Areas that need a session (or are internal): kept out of search engines. */
export const PRIVATE_PREFIXES: readonly string[] = [
  '/api/',
  '/admin',
  '/account',
  '/onboarding',
  '/wallet',
  '/portfolio',
  '/dashboard',
  '/orderbook',
  '/reset-password',
  '/verify-email',
];
