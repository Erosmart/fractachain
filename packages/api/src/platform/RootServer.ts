import express, {
  type Express,
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
} from 'express';
import type { IncomingMessage, ServerResponse } from 'http';
import path from 'path';

/**
 * The web frontend served next to the API: Astro's Node adapter in
 * `middleware` mode exposes exactly this shape.
 */
export interface WebFrontend {
  /** Astro request handler: `(req, res, next)`. */
  handler: (req: IncomingMessage, res: ServerResponse, next?: (err?: unknown) => void) => void;
  /** Built static assets (`dist/client`). */
  clientDir: string;
}

/** Paths answered by the API; everything else belongs to the web app. */
export function isApiPath(url: string | undefined): boolean {
  const pathname = new URL(url ?? '/', 'http://localhost').pathname;
  return pathname === '/health' || pathname === '/api' || pathname.startsWith('/api/');
}

/**
 * Connect/Express middleware that hands API paths to the API app and lets
 * every other request continue (to Astro, or to Vite in development). Uses
 * the raw URL because plain connect stacks (Vite) do not populate `req.path`.
 */
export function apiDispatcher(
  api: Express,
): (req: IncomingMessage, res: ServerResponse, next: (err?: unknown) => void) => void {
  return (req, res, next) => {
    if (!isApiPath(req.url)) return next();
    (api as unknown as (q: IncomingMessage, s: ServerResponse, n: (err?: unknown) => void) => void)(
      req,
      res,
      next,
    );
  };
}

/** Baseline headers for static assets (pages get theirs from Astro's middleware). */
const staticHeaders: RequestHandler = (_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
};

/**
 * One server, one origin: `/api/*` and `/health` go to the API, hashed
 * build assets are served with long-lived caching, and every other request
 * is rendered by Astro (including its own 404 page).
 */
export function createRootApp(
  api: Express,
  web: WebFrontend,
  trustProxy: boolean | number | string,
): Express {
  const root = express();
  root.disable('x-powered-by');
  root.set('trust proxy', trustProxy);
  root.use(apiDispatcher(api));
  root.use(staticHeaders);
  // Vite emits content-hashed file names under /_astro: safe to cache forever.
  root.use(
    '/_astro',
    express.static(path.join(web.clientDir, '_astro'), {
      immutable: true,
      maxAge: '1y',
      index: false,
      fallthrough: true,
    }),
  );
  root.use(express.static(web.clientDir, { index: false, maxAge: '1h', dotfiles: 'ignore' }));
  root.use((req, res, next) => web.handler(req, res, next));
  return root;
}
