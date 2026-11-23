/**
 * The secrets file written by `stellar:deploy` (and read back by
 * `stellar:fund-pool` / `stellar:e2e`). Plain dotenv syntax so the API loads
 * it as-is (`ENV_FILE=<file>`) and CI can `source` it. Never committed: the
 * default location is gitignored and the file is created with mode 0600.
 */
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

export type EnvMap = Record<string, string>;

export function readEnvFile(file: string): EnvMap {
  if (!fs.existsSync(file)) return {};
  return dotenv.parse(fs.readFileSync(file, 'utf8'));
}

function quote(value: string): string {
  // dotenv does not unescape backslashes: refuse anything that would need it.
  if (/["\\\n]/.test(value)) throw new Error('Valor no soportado en el archivo .env');
  return `"${value}"`;
}

/** Merges `values` into `file` (existing keys are replaced, others kept). */
export function writeEnvFile(file: string, values: EnvMap, header: string): void {
  const merged = { ...readEnvFile(file), ...values };
  const body = Object.keys(merged)
    .sort()
    .map((k) => `${k}=${quote(merged[k])}`)
    .join('\n');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `# ${header}\n# Secrets: never commit this file.\n${body}\n`, { mode: 0o600 });
}
