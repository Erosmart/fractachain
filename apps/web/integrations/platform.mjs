// @ts-check
import { createRequire } from 'node:module';
import path from 'node:path';

/**
 * Mounts the Fractachain API inside `astro dev`, so development runs as one
 * process on one origin — exactly like production (`server/main.mjs`).
 *
 * The API is TypeScript (CommonJS) in `packages/api`; `tsx` compiles it on
 * the fly, scoped to this require tree. API changes need a dev-server restart
 * (pages and islands keep Vite's hot reload).
 *
 * @returns {import('astro').AstroIntegration}
 */
export default function fractachainPlatform() {
  /** @type {{ close(): Promise<void> } | undefined} */
  let platform;
  return {
    name: 'fractachain-platform',
    hooks: {
      'astro:server:setup': async ({ server, logger }) => {
        const { require: tsxRequire } = await import('tsx/cjs/api');
        const apiDir = path.dirname(createRequire(import.meta.url).resolve('@fractachain/api/package.json'));
        /** @type {typeof import('@fractachain/api')} */
        const api = tsxRequire(path.join(apiDir, 'src', 'platform', 'index.ts'), import.meta.url);
        const running = await api.startPlatform({ listen: false });
        platform = running;
        server.middlewares.use(running.apiMiddleware);
        server.httpServer?.once('close', () => void running.close());
        logger.info('API montado en el servidor de desarrollo: /api/* y /health');
      },
      'astro:server:done': async () => {
        await platform?.close();
      },
    },
  };
}
