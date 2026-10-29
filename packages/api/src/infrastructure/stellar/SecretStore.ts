import fs from 'fs';
import type { ILogger } from '../../shared/logger';

/**
 * Where platform signing keys (`S…`) live.
 *
 * Read from the environment; when the platform provisions a key at runtime
 * (testnet issuer, PoR oracle…) it is also appended to the `.env` file so the
 * same account survives a restart. That file is gitignored and must never be
 * baked into an image.
 */
export interface ISecretStore {
  get(name: string): string | undefined;
  set(name: string, value: string): void;
}

export class EnvFileSecretStore implements ISecretStore {
  constructor(
    private readonly envFile: string,
    private readonly logger: ILogger,
    private readonly env: NodeJS.ProcessEnv = process.env,
  ) {}

  get(name: string): string | undefined {
    const value = String(this.env[name] ?? '').trim();
    return value || undefined;
  }

  set(name: string, value: string): void {
    if (!/^[A-Z][A-Z0-9_]*$/.test(name) || /[\r\n]/.test(value)) {
      throw new Error(`Nombre o valor de secreto inválido: ${name}`);
    }
    this.env[name] = value;
    try {
      const text = fs.existsSync(this.envFile) ? fs.readFileSync(this.envFile, 'utf8') : '';
      const lines = text.split(/\r?\n/);
      let found = false;
      const next = lines.map((line) => {
        if (line.startsWith(`${name}=`)) {
          found = true;
          return `${name}=${value}`;
        }
        return line;
      });
      if (!found) next.push(`${name}=${value}`);
      const body = next
        .filter((l, i, a) => l || i < a.length - 1)
        .join('\n')
        .replace(/\n*$/, '\n');
      fs.writeFileSync(this.envFile, body, { mode: 0o600 });
    } catch (err) {
      // The key still works for this process; only persistence across restarts is lost.
      this.logger.warn('no se pudo persistir el secreto en .env', { name, err: String(err) });
    }
  }
}

/** Secret store for tests. */
export class InMemorySecretStore implements ISecretStore {
  private readonly values = new Map<string, string>();

  constructor(initial: Record<string, string> = {}) {
    for (const [k, v] of Object.entries(initial)) this.values.set(k, v);
  }

  get(name: string): string | undefined {
    return this.values.get(name);
  }

  set(name: string, value: string): void {
    this.values.set(name, value);
  }
}
