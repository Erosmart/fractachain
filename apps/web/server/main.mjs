// @ts-check
/**
 * Production entry: one Node process, one port, one origin.
 *
 *   /api/*, /health  → Fractachain API (packages/api)
 *   /_astro/*, files → static build output (dist/client)
 *   everything else  → Astro SSR (adapter in middleware mode)
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleShutdownSignals, startPlatform } from '@fractachain/api';
import { handler } from '../dist/server/entry.mjs';
import { legacyRedirectMiddleware } from './legacyRoutes.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));

try {
  const platform = await startPlatform({
    web: {
      // Old Spanish URLs never reach Astro (it doesn't run middleware for unknown routes).
      handler: (req, res, next) => legacyRedirectMiddleware(req, res, () => handler(req, res, next)),
      clientDir: path.resolve(root, '..', 'dist', 'client'),
    },
  });
  handleShutdownSignals(platform);
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
