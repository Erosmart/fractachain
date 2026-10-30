/**
 * Canonical origin for robots.txt and the sitemap: APP_URL when the server
 * has it (behind a proxy the request host may be internal), else the request.
 */
export function siteOrigin(url: URL): string {
  const configured = typeof process !== 'undefined' ? process.env.APP_URL : undefined;
  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      // malformed APP_URL: fall back to the request
    }
  }
  return url.origin;
}
