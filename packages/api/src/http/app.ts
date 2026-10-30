import cors, { type CorsOptions } from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import type { AppConfig } from '../config/env';
import type { ILogger } from '../shared/logger';
import './context';
import type { Controller } from './controllers/Controller';
import type { AuthMiddleware } from './middleware/AuthMiddleware';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import type { RateLimiters } from './middleware/rateLimiters';
import { requestContext } from './middleware/requestContext';

const PRIVATE_NETWORK_ORIGIN =
  /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/;

/**
 * CORS allowlist. v1 reflected *any* origin with credentials enabled; now
 * only configured origins (plus localhost/LAN in development) are accepted.
 * The API authenticates with Bearer tokens, so credentials stay disabled.
 */
export function corsOptions(config: AppConfig['http']): CorsOptions {
  const allowed = new Set(config.corsOrigins.map((o) => o.replace(/\/+$/, '')));
  return {
    origin(origin, callback) {
      if (!origin) return callback(null, true); // curl, server-to-server, same-origin navigations
      if (allowed.has(origin) || (config.allowPrivateNetworkOrigins && PRIVATE_NETWORK_ORIGIN.test(origin))) {
        return callback(null, true);
      }
      return callback(null, false);
    },
    credentials: false,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id', 'X-Requested-With'],
    exposedHeaders: ['X-Request-Id', 'RateLimit', 'RateLimit-Policy', 'Retry-After'],
    maxAge: 600,
  };
}

export interface AppDependencies {
  config: AppConfig;
  logger: ILogger;
  auth: AuthMiddleware;
  limits: RateLimiters;
  controllers: Controller[];
}

/** Builds the Express app. Pure wiring: no listening, no background jobs. */
export function createApp({ config, logger, auth, limits, controllers }: AppDependencies): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.http.trustProxy);
  app.set('etag', false);

  app.use(requestContext(logger));
  app.use(
    helmet({
      // JSON API: nothing here should ever render as a document.
      contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      hsts: config.isProduction ? { maxAge: 31_536_000, includeSubDomains: true } : false,
    }),
  );
  app.use(cors(corsOptions(config.http)));
  app.use(limits.global);

  // KYC selfies are the only large payload; everything else is capped small.
  // The session is checked *before* reading 8 MB, so anonymous clients cannot
  // make the server buffer large bodies.
  app.use('/api/kyc/onboard', auth.attach, auth.requireAuth, auth.csrf, express.json({ limit: '8mb' }));
  // Provider webhooks are signed over the exact bytes: keep them.
  app.use(
    '/api/kyc/didit/webhook',
    express.json({
      limit: '1mb',
      verify: (req, _res, buf) => {
        (req as express.Request).rawBody = Buffer.from(buf);
      },
    }),
  );
  app.use(express.json({ limit: '100kb' }));

  app.use(auth.attach);
  app.use(auth.csrf);
  const router = express.Router();
  for (const controller of controllers) controller.register(router);
  app.use(router);

  app.use(notFoundHandler);
  app.use(errorHandler(logger));
  return app;
}
