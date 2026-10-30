import fs from 'fs';
import path from 'path';
import { ValidationError } from '../../shared/errors';

export interface StoredImage {
  file: string;
  contentType: string;
}

export interface ISelfieStorage {
  /** Validates and stores a `data:image/...;base64,` URL for an account; returns the stored path. */
  save(accountId: string, dataUrl: string): string;
  read(storedPath: string | undefined): StoredImage | null;
  /** Deletes a stored image (account closure). Missing files are fine. */
  remove(storedPath: string | undefined): void;
}

const MAX_BYTES = 5 * 1024 * 1024;

/** File signatures — the declared MIME type of a data URL is attacker-controlled. */
const SIGNATURES: { ext: string; contentType: string; test: (b: Buffer) => boolean }[] = [
  {
    ext: 'png',
    contentType: 'image/png',
    test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  { ext: 'jpg', contentType: 'image/jpeg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    ext: 'webp',
    contentType: 'image/webp',
    test: (b) =>
      b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP',
  },
];

/**
 * KYC selfies on local disk (`<dataDir>/selfies/<accountId>.<ext>`).
 *
 * The image type is decided by its magic bytes, not by the client's claim, so
 * an SVG/HTML payload can never be stored and later served as an image. Files
 * are only ever read back through paths inside the selfie directory.
 */
export class LocalSelfieStorage implements ISelfieStorage {
  private readonly dir: string;

  constructor(dataDir: string) {
    this.dir = path.join(dataDir, 'selfies');
  }

  save(accountId: string, dataUrl: string): string {
    if (!/^[A-Za-z0-9_-]+$/.test(accountId)) throw new ValidationError('Cuenta inválida');
    const match = /^data:image\/[a-zA-Z0-9+.-]+;base64,([A-Za-z0-9+/=\s]+)$/.exec(dataUrl);
    if (!match) throw new ValidationError('Imagen inválida');
    const bytes = Buffer.from(match[1], 'base64');
    if (bytes.length === 0) throw new ValidationError('Imagen vacía');
    if (bytes.length > MAX_BYTES) throw new ValidationError('La imagen supera los 5 MB');
    const kind = SIGNATURES.find((s) => s.test(bytes));
    if (!kind) throw new ValidationError('Formato de imagen no soportado (usá JPG, PNG o WEBP)');

    fs.mkdirSync(this.dir, { recursive: true, mode: 0o700 });
    for (const other of SIGNATURES) {
      const stale = path.join(this.dir, `${accountId}.${other.ext}`);
      if (other.ext !== kind.ext && fs.existsSync(stale)) fs.rmSync(stale);
    }
    const file = path.join(this.dir, `${accountId}.${kind.ext}`);
    fs.writeFileSync(file, bytes, { mode: 0o600 });
    return file;
  }

  remove(storedPath: string | undefined): void {
    if (!storedPath) return;
    const file = path.join(this.dir, path.basename(storedPath));
    try {
      fs.rmSync(file, { force: true });
    } catch {
      // nothing to delete
    }
  }

  read(storedPath: string | undefined): StoredImage | null {
    if (!storedPath) return null;
    // Stored paths may come from older deployments (absolute, other data dir):
    // only the basename is trusted, and only inside our own directory.
    const file = path.join(this.dir, path.basename(storedPath));
    if (!fs.existsSync(file)) return null;
    const ext = path.extname(file).slice(1).toLowerCase();
    const kind = SIGNATURES.find((s) => s.ext === ext || (ext === 'jpeg' && s.ext === 'jpg'));
    return { file, contentType: kind?.contentType ?? 'application/octet-stream' };
  }
}
