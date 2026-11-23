// @ts-check
/**
 * Routes are English. The first Spanish URLs (shared before the move) keep
 * working through a permanent redirect; `?tema=` becomes `?topic=`.
 * Lives in server/ (the production image only ships this folder besides dist);
 * shared by the production server, the dev server and the Astro middleware.
 */

/** @type {Record<string, string>} */
export const MOVED_ROUTES = {
  '/legal/terminos': '/legal/terms',
  '/legal/privacidad': '/legal/privacy',
  '/legal/riesgos': '/legal/risks',
  '/ayuda': '/help',
  '/transparencia': '/transparency',
  '/contacto': '/contact',
  '/account/privacidad': '/account/privacy',
  '/admin/soporte': '/admin/support',
};

/** @type {Record<string, string>} */
const LEGACY_TOPICS = {
  emisor: 'issuer',
  emisores: 'issuer',
  privacidad: 'privacy',
  seguridad: 'security',
  verificacion: 'kyc',
};

/**
 * Where an old URL lives now, or null.
 * @param {string} pathAndQuery request path, with or without the query string
 * @returns {string | null}
 */
export function legacyRedirect(pathAndQuery) {
  const url = new URL(pathAndQuery, 'http://localhost');
  const target = MOVED_ROUTES[url.pathname.replace(/\/+$/, '')];
  if (!target) return null;
  const params = new URLSearchParams(url.search);
  const tema = params.get('tema');
  if (tema) {
    params.delete('tema');
    params.set('topic', LEGACY_TOPICS[tema.toLowerCase()] ?? tema);
  }
  const query = params.toString();
  return `${target}${query ? `?${query}` : ''}`;
}

/**
 * Connect/Express middleware answering 301 for moved routes.
 * @param {import('node:http').IncomingMessage} req
 * @param {import('node:http').ServerResponse} res
 * @param {() => void} next
 */
export function legacyRedirectMiddleware(req, res, next) {
  const to = req.method === 'GET' || req.method === 'HEAD' ? legacyRedirect(req.url || '/') : null;
  if (!to) return next();
  res.statusCode = 301;
  res.setHeader('Location', to);
  res.end();
}
