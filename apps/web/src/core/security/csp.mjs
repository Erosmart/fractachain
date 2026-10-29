// @ts-check
/**
 * Content-Security-Policy, defined once and consumed by two places:
 *
 * - `astro.config.mjs` feeds it to Astro's native CSP (`security.csp`), which
 *   emits a `<meta http-equiv="content-security-policy">` per page with the
 *   sha256 hashes of every inline script Astro generates (island hydration,
 *   client directives) — so `script-src` never needs `'unsafe-inline'`.
 * - `src/middleware.ts` sends the non-script directives as a real HTTP header,
 *   which is the only way to express `frame-ancestors` (ignored inside meta).
 *
 * Plain `.mjs` on purpose: the Astro config loads it before Vite compiles TS.
 */

/**
 * The single `is:inline` script of the app: applies the persisted theme before
 * first paint so dark mode never flashes. Hashed below — keep it byte-stable.
 */
export const THEME_BOOTSTRAP_SCRIPT =
  "try{if(localStorage.getItem('fc_theme')==='dark')document.documentElement.classList.add('dark')}catch(e){}";

const GOOGLE_FONTS_CSS = 'https://fonts.googleapis.com';
const GOOGLE_FONTS_FILES = 'https://fonts.gstatic.com';

/** Firebase Auth endpoints (only reached after the Google button lazy-loads the SDK). */
const FIREBASE_CONNECT = [
  'https://identitytoolkit.googleapis.com',
  'https://securetoken.googleapis.com',
  'https://www.googleapis.com',
  'https://firebaseinstallations.googleapis.com',
];

/** @param {string | undefined} raw */
function originOf(raw) {
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

/**
 * Sources the browser may call for API traffic. When the configured API is a
 * loopback URL the client rewrites it to the page's LAN host at runtime (see
 * AppConfig), so the policy has to allow that port on any host.
 *
 * @param {string | undefined} apiUrl
 */
function apiSources(apiUrl) {
  const origin = originOf(apiUrl) ?? 'http://localhost:4000';
  const url = new URL(origin);
  const sources = [origin];
  if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
    const port = url.port || (url.protocol === 'https:' ? '443' : '80');
    sources.push(`http://*:${port}`, `https://*:${port}`);
  }
  return sources;
}

/**
 * @typedef {object} CspInput
 * @property {string | undefined} apiUrl            PUBLIC_API_URL
 * @property {string | undefined} [firebaseAuthDomain] PUBLIC_FIREBASE_AUTH_DOMAIN
 * @property {boolean} [dev]                         adds the Vite HMR websocket
 */

/**
 * Directives other than `script-src` / `style-src` (those two are owned by
 * Astro's hashing). Shared verbatim by the meta tag and the HTTP header.
 *
 * @param {CspInput} input
 * @returns {string[]}
 */
export function baseDirectives({ apiUrl, firebaseAuthDomain, dev = false }) {
  const frames = ['https://*.firebaseapp.com', 'https://accounts.google.com', 'https://apis.google.com'];
  const authDomain = firebaseAuthDomain ? `https://${firebaseAuthDomain.replace(/^https?:\/\//, '')}` : null;
  if (authDomain && !frames.includes(authDomain)) frames.push(authDomain);

  const connect = ["'self'", ...apiSources(apiUrl), 'https://*.stellar.org', ...FIREBASE_CONNECT];
  if (dev) connect.push('ws:', 'wss:');

  return [
    "base-uri 'self'",
    "object-src 'none'",
    "form-action 'self'",
    `connect-src ${connect.join(' ')}`,
    "img-src 'self' data: blob: https:",
    `font-src 'self' data: ${GOOGLE_FONTS_FILES}`,
    `frame-src ${frames.join(' ')}`,
    "worker-src 'self' blob:",
    "manifest-src 'self'",
  ];
}

/** `script-src` sources besides Astro's own hashes (gapi, used by the Firebase popup). */
export const SCRIPT_RESOURCES = ["'self'", 'https://apis.google.com'];

/**
 * `style-src`: React islands render `style={...}` attributes (progress bars,
 * depth bars) that cannot be hashed, so inline styles stay allowed. Scripts —
 * the actual XSS vector — remain hash-only.
 */
export const STYLE_RESOURCES = ["'self'", "'unsafe-inline'", GOOGLE_FONTS_CSS];

/**
 * Header-only policy: everything a `<meta>` CSP cannot express, plus the base
 * directives so a proxy that strips the meta tag still leaves a policy behind.
 *
 * @param {CspInput} input
 */
export function headerPolicy(input) {
  return ["frame-ancestors 'none'", ...baseDirectives(input)].join('; ');
}
