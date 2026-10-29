import { normalizeUser, type SessionUser } from './SessionUser';

export interface StoredSession {
  token: string;
  user: SessionUser;
  /** ISO timestamp; `null` when the API did not announce an expiry. */
  expiresAt: string | null;
}

/** Persistence port for the session (ISP: load / save / clear, nothing else). */
export interface ITokenStorage {
  load(): StoredSession | null;
  save(session: StoredSession): void;
  clear(): void;
}

const KEYS = {
  token: 'fc_auth_token',
  user: 'fc_auth_user',
  expires: 'fc_auth_expires',
} as const;

/**
 * Browser storage. Keys are the ones the Next.js app used, so a signed-in user
 * stays signed in across the migration. Every access is guarded: Safari private
 * mode and locked-down profiles throw on `localStorage`.
 */
export class LocalStorageTokenStorage implements ITokenStorage {
  constructor(private readonly storage: Storage | null = LocalStorageTokenStorage.available()) {}

  load(): StoredSession | null {
    try {
      const token = this.storage?.getItem(KEYS.token);
      const user = this.storage?.getItem(KEYS.user);
      if (!token || !user) return null;
      return {
        token,
        user: normalizeUser(JSON.parse(user)),
        expiresAt: this.storage?.getItem(KEYS.expires) || null,
      };
    } catch {
      return null;
    }
  }

  save(session: StoredSession): void {
    try {
      this.storage?.setItem(KEYS.token, session.token);
      this.storage?.setItem(KEYS.user, JSON.stringify(session.user));
      if (session.expiresAt) this.storage?.setItem(KEYS.expires, session.expiresAt);
      else this.storage?.removeItem(KEYS.expires);
    } catch {
      // storage full or disabled: the session still lives in memory for this tab
    }
  }

  clear(): void {
    try {
      this.storage?.removeItem(KEYS.token);
      this.storage?.removeItem(KEYS.user);
      this.storage?.removeItem(KEYS.expires);
    } catch {
      // nothing to clear
    }
  }

  private static available(): Storage | null {
    try {
      return typeof window !== 'undefined' ? window.localStorage : null;
    } catch {
      return null;
    }
  }
}

/** In-memory storage for SSR and tests. */
export class MemoryTokenStorage implements ITokenStorage {
  private session: StoredSession | null = null;

  load(): StoredSession | null {
    return this.session;
  }

  save(session: StoredSession): void {
    this.session = session;
  }

  clear(): void {
    this.session = null;
  }
}
