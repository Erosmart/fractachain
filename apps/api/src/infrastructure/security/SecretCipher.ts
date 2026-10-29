import crypto from 'crypto';

export interface ISecretCipher {
  seal(plain: string): string;
  /** Decrypts; `resealed` is set when the value was sealed with a retired key and should be persisted again. */
  open(sealed: string): { plain: string; resealed?: string };
  isSealed(value: string): boolean;
}

/**
 * AES-256-GCM envelope for custodial wallet secrets: `enc:<iv>:<tag>:<data>` (hex).
 *
 * The format is byte-compatible with v1 so existing `users.json` files keep
 * decrypting. New: key rotation. Set the new `WALLET_PEPPER` and keep the old
 * one in `WALLET_PEPPER_PREVIOUS`; secrets sealed with the old key still open
 * and come back re-sealed with the new one for the caller to persist.
 */
export class AesGcmSecretCipher implements ISecretCipher {
  private static readonly SALT = 'fractachain-wallet';
  private readonly current: Buffer;
  private readonly previous?: Buffer;

  constructor(pepper: string, previousPepper?: string) {
    this.current = AesGcmSecretCipher.deriveKey(pepper);
    this.previous = previousPepper ? AesGcmSecretCipher.deriveKey(previousPepper) : undefined;
  }

  private static deriveKey(pepper: string): Buffer {
    return crypto.scryptSync(pepper, AesGcmSecretCipher.SALT, 32);
  }

  isSealed(value: string): boolean {
    return value.startsWith('enc:');
  }

  seal(plain: string): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.current, iv);
    const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return `enc:${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${enc.toString('hex')}`;
  }

  open(sealed: string): { plain: string; resealed?: string } {
    try {
      return { plain: this.decrypt(sealed, this.current) };
    } catch (err) {
      if (!this.previous) throw err;
      const plain = this.decrypt(sealed, this.previous);
      return { plain, resealed: this.seal(plain) };
    }
  }

  private decrypt(sealed: string, key: Buffer): string {
    const [prefix, ivHex, tagHex, dataHex] = sealed.split(':');
    if (prefix !== 'enc' || !ivHex || !tagHex || !dataHex) {
      throw new Error('Clave de custodia con formato inválido');
    }
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    return Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]).toString('utf8');
  }
}
