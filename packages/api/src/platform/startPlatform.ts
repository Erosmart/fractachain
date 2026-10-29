import type { Server } from 'http';
import type { Express } from 'express';
import { lastConfigWarnings, loadConfig, type AppConfig } from '../config/env';
import { buildContainer, type Container } from '../container';
import { PinoLogger, type ILogger } from '../shared/logger';
import { loadEnvironment } from './environment';
import { apiDispatcher, createRootApp, type WebFrontend } from './RootServer';

export interface PlatformOptions {
  /** `.env` files to load before reading the configuration (see `loadEnvironment`). */
  envFiles?: string[];
  /** Frontend served by the same server (production). Omit for an API-only server. */
  web?: WebFrontend;
  /** Bind the HTTP port (default). `false` returns only the middleware (Astro dev server). */
  listen?: boolean;
  /** Run the settlement sweep in this process (default true). */
  backgroundJobs?: boolean;
}

export interface RunningPlatform {
  config: AppConfig;
  logger: ILogger;
  container: Container;
  /** The API alone (Express app). */
  api: Express;
  /** Middleware answering `/api/*` and `/health`, calling `next()` for anything else. */
  apiMiddleware: ReturnType<typeof apiDispatcher>;
  server?: Server;
  close(): Promise<void>;
}

/**
 * Boots Fractachain: configuration, persistence restore, account bootstrap,
 * HTTP and background jobs. The same entry point serves three shapes:
 * API + Astro in one process (production), API middleware inside `astro dev`
 * (development) and API-only (tests, scripts, split deployments).
 */
export async function startPlatform(options: PlatformOptions = {}): Promise<RunningPlatform> {
  loadEnvironment(options.envFiles);
  const config = loadConfig();
  const logger = PinoLogger.create({ level: config.log.level, service: 'fractachain' });
  for (const warning of lastConfigWarnings()) logger.warn(warning);

  const container = await buildContainer(config, logger);
  await container.bootstrap.run();
  if (options.backgroundJobs !== false) container.sweep.start();

  const api = container.app;
  const apiMiddleware = apiDispatcher(api);
  let server: Server | undefined;

  if (options.listen !== false) {
    const app = options.web ? createRootApp(api, options.web, config.http.trustProxy) : api;
    server = app.listen(config.http.port, config.http.host, () => {
      logger.info(options.web ? 'Fractachain (web + API) escuchando' : 'API escuchando', {
        host: config.http.host,
        port: config.http.port,
        env: config.env,
        network: config.stellar.network,
      });
    });
    server.requestTimeout = 120_000;
    server.headersTimeout = 65_000;
    server.keepAliveTimeout = 61_000;
  }

  return {
    config,
    logger,
    container,
    api,
    apiMiddleware,
    server,
    async close() {
      await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
      await container.close();
    },
  };
}

/** Wires SIGTERM/SIGINT to a graceful shutdown with a hard deadline. */
export function handleShutdownSignals(platform: RunningPlatform): void {
  let stopping = false;
  const shutdown = (signal: string) => {
    if (stopping) return;
    stopping = true;
    platform.logger.info('apagando', { signal });
    const force = setTimeout(() => process.exit(1), 15_000);
    force.unref();
    platform
      .close()
      .catch(() => undefined)
      .finally(() => process.exit(0));
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('unhandledRejection', (reason) => platform.logger.error('promesa rechazada sin manejar', { reason: String(reason) }));
}
