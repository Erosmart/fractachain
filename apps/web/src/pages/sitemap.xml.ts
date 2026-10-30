import type { APIRoute } from 'astro';
import { LEGAL_DOCS, PUBLIC_PATHS } from '@/features/legal/documents';
import { siteOrigin } from '@/features/legal/site';

const escapeXml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Sitemap of the public pages (legal documents carry their effective date as lastmod). */
export const GET: APIRoute = ({ url }) => {
  const origin = siteOrigin(url);
  const lastmod = new Map(LEGAL_DOCS.map((d) => [d.path, d.effective]));
  const entries = PUBLIC_PATHS.map((path) => {
    const mod = lastmod.get(path);
    return [
      '  <url>',
      `    <loc>${escapeXml(`${origin}${path}`)}</loc>`,
      ...(mod ? [`    <lastmod>${mod}</lastmod>`] : []),
      '  </url>',
    ].join('\n');
  });
  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...entries,
    '</urlset>',
    '',
  ].join('\n');
  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
  });
};
