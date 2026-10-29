import { defineMiddleware } from 'astro:middleware';
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale } from './core/i18n/translate';
import { headerPolicy } from './core/security/csp.mjs';

/**
 * Fallback policy for responses Astro did not attach one to (dev server,
 * redirects): every directive except script/style hashes.
 */
const FALLBACK_CSP = headerPolicy({
  apiUrl: import.meta.env.PUBLIC_API_URL,
  firebaseAuthDomain: import.meta.env.PUBLIC_FIREBASE_AUTH_DOMAIN,
  dev: import.meta.env.DEV,
});

const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  // The KYC form may use the camera for the selfie; nothing else is needed.
  'Permissions-Policy': 'camera=(self), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()',
  // Firebase's Google sign-in talks to its popup through window.opener.
  'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'X-DNS-Prefetch-Control': 'off',
};

/**
 * Astro (security.csp) sends the page policy as a header with the sha256 of
 * every inline script it rendered. It cannot express `frame-ancestors` through
 * config, so that directive is appended here instead of replacing the policy.
 */
function contentSecurityPolicy(astroPolicy: string | null): string {
  if (!astroPolicy) return FALLBACK_CSP;
  return /frame-ancestors/.test(astroPolicy) ? astroPolicy : `${astroPolicy.replace(/;\s*$/, '')}; frame-ancestors 'none'`;
}

function isHttps(request: Request, url: URL): boolean {
  return url.protocol === 'https:' || request.headers.get('x-forwarded-proto') === 'https';
}

export const onRequest = defineMiddleware(async (context, next) => {
  const cookie = context.cookies.get(LOCALE_COOKIE)?.value;
  context.locals.locale = isLocale(cookie) ? cookie : DEFAULT_LOCALE;

  const response = await next();
  const headers = new Headers(response.headers);
  headers.set('Content-Security-Policy', contentSecurityPolicy(response.headers.get('content-security-policy')));
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) headers.set(name, value);
  if (isHttps(context.request, context.url)) {
    headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  // Pages are rendered per locale cookie: shared caches must not mix them.
  if ((headers.get('content-type') ?? '').includes('text/html')) {
    headers.append('Vary', 'Cookie');
    if (!headers.has('Cache-Control')) headers.set('Cache-Control', 'private, no-cache');
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
});
