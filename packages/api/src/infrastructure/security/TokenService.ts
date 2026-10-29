import crypto from 'crypto';
import type { IClock } from '../../shared/clock';
import type { IDocumentStore } from '../persistence/DocumentStore';

export interface SessionClaims {
  /** Account id. */
  sub: string;
  /** Unique token id — what revocation keys on. */
  jti: string;
  /** Issued-at, epoch ms. */
  iat: number;
  /** Expiry, epoch ms. */
  exp: number;
}

export interface IssuedToken {
  token: string;
  claims: SessionClaims;
  expiresAt: string;
}

export interface ITokenService {
  issue(accountId: string): IssuedToken;
  verify(token: string): SessionClaims | null;
  revoke(token: string): boolean;
}

/**
 * Stateless session tokens: `fc2.<base64url(claims)>.<base64url(HMAC-SHA256)>`.
 *
 * Fixes three v1 problems: tokens never expired, the signature was truncated
 * to 96 bits and compared with `===` (timing leak), and logout only dropped an
 * in-memory map while the HMAC path kept accepting the token forever. Now the
 * full MAC is compared in constant time, every token carries `exp`, and
 * logout records the `jti` in a persisted deny-list until the token would
 * have expired anyway.
 *
 * v1 `fc1.` tokens are deliberately rejected: users sign in once more.
 */
export class HmacTokenService implements ITokenService {
  private static readonly PREFIX = 'fc2';

  constructor(
    private readonly secret: string,
    private readonly ttlMs: number,
    private readonly revocations: IRevocationList,
    private readonly clock: IClock,
  ) {}

  issue(accountId: string): IssuedToken {
    const now = this.clock.now();
    const claims: SessionClaims = {
      sub: accountId,
      jti: crypto.randomBytes(16).toString('base64url'),
      iat: now,
      exp: now + this.ttlMs,
    };
    const body = Buffer.from(JSON.stringify(claims)).toString('base64url');
    return {
      token: `${HmacTokenService.PREFIX}.${body}.${this.sign(body)}`,
      claims,
      expiresAt: new Date(claims.exp).toISOString(),
    };
  }

  verify(token: string): SessionClaims | null {
    const claims = this.decode(token);
    if (!claims) return null;
    if (claims.exp <= this.clock.now()) return null;
    if (this.revocations.isRevoked(claims.jti)) return null;
    return claims;
  }

  revoke(token: string): boolean {
    const claims = this.decode(token);
    if (!claims) return false;
    this.revocations.revoke(claims.jti, claims.exp);
    return true;
  }

  private decode(token: string): SessionClaims | null {
    const parts = String(token || '').split('.');
    if (parts.length !== 3 || parts[0] !== HmacTokenService.PREFIX) return null;
    const [, body, mac] = parts;
    const expected = Buffer.from(this.sign(body));
    const actual = Buffer.from(mac);
    if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) return null;
    try {
      const claims = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as SessionClaims;
      if (
        typeof claims.sub !== 'string' ||
        typeof claims.jti !== 'string' ||
        typeof claims.exp !== 'number'
      ) {
        return null;
      }
      return claims;
    } catch {
      return null;
    }
  }

  private sign(body: string): string {
    return crypto
      .createHmac('sha256', this.secret)
      .update(`${HmacTokenService.PREFIX}.${body}`)
      .digest('base64url');
  }
}

export interface IRevocationList {
  revoke(jti: string, expiresAtMs: number): void;
  isRevoked(jti: string): boolean;
}

/**
 * Deny-list of logged-out token ids, persisted so a restart does not
 * resurrect revoked sessions. Entries are pruned once their token expired.
 */
export class PersistentRevocationList implements IRevocationList {
  private static readonly KEY = 'revoked-sessions.json';
  private readonly entries: Map<string, number>;

  constructor(
    private readonly store: IDocumentStore,
    private readonly clock: IClock,
  ) {
    const raw = store.read<Record<string, number>>(PersistentRevocationList.KEY, {});
    this.entries = new Map(Object.entries(raw));
    this.prune();
  }

  revoke(jti: string, expiresAtMs: number): void {
    this.entries.set(jti, expiresAtMs);
    this.prune();
    this.store.write(PersistentRevocationList.KEY, Object.fromEntries(this.entries));
  }

  isRevoked(jti: string): boolean {
    return this.entries.has(jti);
  }

  private prune(): void {
    const now = this.clock.now();
    for (const [jti, exp] of this.entries) {
      if (exp <= now) this.entries.delete(jti);
    }
  }
}
