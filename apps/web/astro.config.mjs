// @ts-check
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import react from '@astrojs/react';
import { loadEnv } from 'vite';
import fractachainPlatform from './integrations/platform.mjs';
import {
  SCRIPT_RESOURCES,
  STYLE_RESOURCES,
  THEME_BOOTSTRAP_SCRIPT,
  baseDirectives,
} from './src/core/security/csp.mjs';

// One `.env` at the repository root serves the web (PUBLIC_*, inlined at build
// time) and the API (server-only, read at runtime).
const ENV_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// PUBLIC_* values are inlined into the client bundle at build time, so the
// CSP must be computed from the same source (process env wins over .env).
const env = { ...loadEnv(process.env.NODE_ENV ?? 'production', ENV_DIR, ''), ...process.env };

/** @param {string} source */
const sha256 = (source) => `sha256-${createHash('sha256').update(source).digest('base64')}`;

// https://docs.astro.build/en/reference/configuration-reference/
export default defineConfig({
  output: 'server',
  // `middleware`: the API's server (server/main.mjs) mounts Astro's handler
  // behind /api, so web and API share one process, port and origin.
  adapter: node({ mode: 'middleware' }),
  integrations: [react(), fractachainPlatform()],
  server: { port: 3000, host: true },
  // The session lives in the browser (bearer token for the API); Astro's
  // server-side sessions would only add a writable store nobody reads.
  session: false,
  devToolbar: { enabled: false },
  // No markdown content: drop Shiki (its inline styles clash with the CSP).
  markdown: { syntaxHighlight: false },
  security: {
    checkOrigin: true,
    csp: {
      algorithm: 'SHA-256',
      directives: [
        "default-src 'self'",
        // Directive strings are built at runtime; Astro types them as template literals.
        .../** @type {any[]} */ (
          baseDirectives({
            apiUrl: env.PUBLIC_API_URL,
            firebaseAuthDomain: env.PUBLIC_FIREBASE_AUTH_DOMAIN,
          })
        ),
      ],
      scriptDirective: {
        resources: SCRIPT_RESOURCES,
        hashes: [/** @type {`sha256-${string}`} */ (sha256(THEME_BOOTSTRAP_SCRIPT))],
      },
      styleDirective: {
        resources: STYLE_RESOURCES,
      },
    },
  },
  vite: {
    envDir: ENV_DIR,
    build: {
      // Firebase and Freighter are dynamically imported; keep their chunks out
      // of the warning noise without hiding real regressions in app code.
      chunkSizeWarningLimit: 900,
    },
  },
});
