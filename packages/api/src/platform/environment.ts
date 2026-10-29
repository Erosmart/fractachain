import dotenv from 'dotenv';
import path from 'path';
import { REPO_ROOT } from '../config/env';

/**
 * Loads `.env` files into `process.env` (first file wins; real environment
 * variables always win over files). Default: `ENV_FILE`, then the repo-root
 * `.env` shared by the web and the API.
 */
export function loadEnvironment(files?: string[]): string[] {
  const candidates = files ?? [process.env.ENV_FILE, path.join(REPO_ROOT, '.env')].filter((f): f is string => Boolean(f));
  for (const file of candidates) dotenv.config({ path: file, quiet: true });
  return candidates;
}
