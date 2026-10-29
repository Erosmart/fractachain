import dotenv from 'dotenv';
import path from 'path';
import { API_ROOT, ConfigError, lastConfigWarnings, loadConfig } from './config/env';
import { buildContainer } from './container';
import { PinoLogger } from './shared/logger';

// apps/api/.env first (works from any cwd), then a .env in the cwd for overrides.
dotenv.config({ path: process.env.ENV_FILE || path.join(API_ROOT, '.env'), quiet: true });
dotenv.config({ quiet: true });

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = PinoLogger.create({ level: config.log.level, service: 'fractachain-api' });
  for (const warning of lastConfigWarnings()) logger.warn(warning);

  const container = await buildContainer(config, logger);
  await container.bootstrap.run();

  const server = container.app.listen(config.http.port, config.http.host, () => {
    logger.info('API escuchando', { host: config.http.host, port: config.http.port, env: config.env, network: config.stellar.network });
  });
  server.requestTimeout = 120_000;
  server.headersTimeout = 65_000;
  server.keepAliveTimeout = 61_000;
  container.sweep.start();

  let stopping = false;
  const shutdown = (signal: string) => {
    if (stopping) return;
    stopping = true;
    logger.info('apagando', { signal });
    const force = setTimeout(() => process.exit(1), 15_000);
    force.unref();
    server.close(async () => {
      await container.close().catch(() => undefined);
      process.exit(0);
    });
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('unhandledRejection', (reason) => logger.error('promesa rechazada sin manejar', { reason: String(reason) }));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err instanceof ConfigError ? err.message : err);
  process.exit(1);
});
