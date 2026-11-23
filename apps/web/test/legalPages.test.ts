import { describe, expect, it } from 'vitest';
import { formatLegalDate, LEGAL_DOCS, PRIVATE_PREFIXES, PUBLIC_PATHS } from '@/features/legal/documents';
import { filterHelp, normalize } from '@/features/legal/components/HelpCenter';
import { shortId } from '@/features/legal/components/TransparencyContracts';
import { siteOrigin } from '@/features/legal/site';
import { dictionaries } from '@/core/i18n/dictionaries';

describe('legal documents', () => {
  it('lists every document in the sitemap and keeps private areas out', () => {
    for (const doc of LEGAL_DOCS) expect(PUBLIC_PATHS).toContain(doc.path);
    for (const path of PUBLIC_PATHS) {
      expect(PRIVATE_PREFIXES.some((p) => path.startsWith(p))).toBe(false);
    }
  });

  it('formats the effective date the same in both runtimes', () => {
    expect(formatLegalDate('2026-10-30', 'es')).toBe('30 de octubre de 2026');
    expect(formatLegalDate('2026-10-30', 'en')).toBe('October 30, 2026');
  });

  it('has a title and summary for every document in both languages', () => {
    for (const locale of ['es', 'en'] as const) {
      for (const doc of LEGAL_DOCS) {
        const copy = dictionaries[locale].legal.docs[doc.id];
        expect(copy.title.length).toBeGreaterThan(3);
        expect(copy.summary.length).toBeGreaterThan(1);
      }
    }
  });

  it('prefers APP_URL for the canonical origin', () => {
    const before = process.env.APP_URL;
    process.env.APP_URL = 'https://demo.fractachain.test/';
    expect(siteOrigin(new URL('http://10.0.0.1:3000/robots.txt'))).toBe('https://demo.fractachain.test');
    process.env.APP_URL = 'not a url';
    expect(siteOrigin(new URL('http://localhost:3000/x'))).toBe('http://localhost:3000');
    if (before === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = before;
  });
});

describe('help center', () => {
  const categories = dictionaries.es.legal.help.categories;

  it('matches without accents and requires every word', () => {
    expect(normalize('Verificación')).toBe('verificacion');
    const kyc = filterHelp(categories, 'all', 'verificacion identidad');
    expect(kyc.length).toBeGreaterThan(0);
    expect(filterHelp(categories, 'all', 'freighter testnet').flatMap((c) => c.items).length).toBeGreaterThan(
      0,
    );
    expect(filterHelp(categories, 'all', 'zzzz')).toEqual([]);
  });

  it('filters by category', () => {
    const wallet = filterHelp(categories, 'wallet', '');
    expect(wallet.map((c) => c.id)).toEqual(['wallet']);
  });

  it('mirrors the categories in English', () => {
    const en = dictionaries.en.legal.help.categories;
    expect(en.map((c) => c.id)).toEqual(categories.map((c) => c.id));
    en.forEach((c, i) => expect(c.items.length).toBe(categories[i].items.length));
  });

  it('shortens contract IDs for display', () => {
    expect(shortId('CAPXJ6EF33ZO7NQISY4K3MKCFFQUX4UWYMVFWZN2VT6QJUP5NQC66EVP')).toBe('CAPXJ6…C66EVP');
    expect(shortId('GABC')).toBe('GABC');
  });
});
