import type { APIRoute } from 'astro';
import { PRIVATE_PREFIXES } from '@/features/legal/documents';
import { siteOrigin } from '@/features/legal/site';

/** Public pages are indexable; session-only and internal areas are not. */
export const GET: APIRoute = ({ url }) => {
  const lines = [
    'User-agent: *',
    'Allow: /',
    ...PRIVATE_PREFIXES.map((prefix) => `Disallow: ${prefix}`),
    '',
    `Sitemap: ${siteOrigin(url)}/sitemap.xml`,
    '',
  ];
  return new Response(lines.join('\n'), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
  });
};
