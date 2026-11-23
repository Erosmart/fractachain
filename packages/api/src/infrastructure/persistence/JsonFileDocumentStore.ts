import fs from 'fs';
import path from 'path';
import type { ILogger } from '../../shared/logger';
import type { IDocumentStore } from './DocumentStore';

const KEY_PATTERN = /^[a-z0-9][a-z0-9._-]*\.json$/i;

/**
 * Stores each document as `<dataDir>/<key>` (e.g. `data/listings.json`).
 *
 * Writes go to a temp file and are renamed into place, so a crash mid-write
 * never leaves a truncated JSON file that would wipe the collection on the
 * next boot. Keys are validated to keep every path inside `dataDir`.
 */
export class JsonFileDocumentStore implements IDocumentStore {
  constructor(
    private readonly dataDir: string,
    private readonly logger: ILogger,
  ) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  read<T>(key: string, fallback: T): T {
    const file = this.fileFor(key);
    try {
      if (!fs.existsSync(file)) return fallback;
      return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
    } catch (err) {
      this.logger.error('documento ilegible, se usa el valor por defecto', { key, err: String(err) });
      return fallback;
    }
  }

  write(key: string, data: unknown): void {
    const file = this.fileFor(key);
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, file);
  }

  /** Overwrites the on-disk copy without validation of contents — used by the Postgres restore. */
  replaceRaw(key: string, data: unknown): void {
    this.write(key, data);
  }

  private fileFor(key: string): string {
    if (!KEY_PATTERN.test(key)) throw new Error(`Clave de documento inválida: ${key}`);
    return path.join(this.dataDir, key);
  }
}
