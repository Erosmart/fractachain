import { normalizeUser, type SessionUser } from './SessionUser';

/**
 * Non-secret copy of the signed-in user, so the UI can render "who is signed
 * in" instantly on every page load. The credential itself is the HttpOnly
 * `fc_session` cookie, which JavaScript can neither read nor leak; this cache
 * is re-validated against `/api/auth/me` and dropped on any 401.
 */
export interface CachedSession {
  user: SessionUser;
  /** ISO timestamp; `null` when the API did not announce an expiry. */
  expiresAt: string | null;
}

/** Persistence port for the cached session (ISP: load / save / clear, nothing else). */
export interface ISessionCache {
  load(): CachedSession | null;
  save(session: CachedSession): void;
  clear(): void;
}

const KEYS = {
  user: 'fc_auth_user',
  expires: 'fc_auth_expires',
} as const;

/** Bearer tokens the previous versions kept in localStorage: removed on sight. */
export const LEGACY_TOKEN_KEYS: readonly string[] = ['fc_auth_token'];

/**
 * `localStorage` implementation. Every access is guarded: Safari private mode
 * and locked-down profiles throw on storage access.
 */
export class LocalStorageSessionCache implements ISessionCache {
  constructor(private readonly storage: Storage | null = LocalStorageSessionCache.available()) {
    this.purgeLegacyTokens();
  }

  load(): CachedSession | null {
    try {
      const user = this.storage?.getItem(KEYS.user);
      if (!user) return null;
      return {
        user: normalizeUser(JSON.parse(user)),
        expiresAt: this.storage?.getItem(KEYS.expires) || null,
      };
    } catch {
      return null;
    }
  }

  save(session: CachedSession): void {
    try {
      this.storage?.setItem(KEYS.user, JSON.stringify(session.user));
      if (session.expiresAt) this.storage?.setItem(KEYS.expires, session.expiresAt);
      else this.storage?.removeItem(KEYS.expires);
    } catch {
      // storage full or disabled: the session still lives in memory for this tab
    }
  }

  clear(): void {
    try {
      this.storage?.removeItem(KEYS.user);
      this.storage?.removeItem(KEYS.expires);
    } catch {
      // nothing to clear
    }
    this.purgeLegacyTokens();
  }

  private purgeLegacyTokens(): void {
    try {
      for (const key of LEGACY_TOKEN_KEYS) this.storage?.removeItem(key);
    } catch {
      // storage unavailable
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

/** In-memory cache for SSR and tests. */
export class MemorySessionCache implements ISessionCache {
  private session: CachedSession | null = null;

  load(): CachedSession | null {
    return this.session;
  }

  save(session: CachedSession): void {
    this.session = session;
  }

  clear(): void {
    this.session = null;
  }
}
